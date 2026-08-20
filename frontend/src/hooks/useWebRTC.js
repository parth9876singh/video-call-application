import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const DEFAULT_MEDIA_CONSTRAINTS = {
  audio: true,
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    facingMode: 'user',
  },
};

/**
 * Map getUserMedia / device failures to clear, user-facing messages.
 */
function mapMediaError(err) {
  const name = err?.name || '';
  const message = err?.message || 'Unknown media error';

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return {
      code: 'PERMISSION_DENIED',
      message:
        'Camera and microphone permission was denied. Allow access in the browser settings and try again.',
    };
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      code: 'DEVICE_NOT_FOUND',
      message:
        'No camera or microphone was found. Connect a device and try again.',
    };
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return {
      code: 'DEVICE_IN_USE',
      message:
        'Camera or microphone is already in use by another application.',
    };
  }

  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return {
      code: 'CONSTRAINTS_FAILED',
      message: 'Requested media settings are not supported by your devices.',
    };
  }

  if (name === 'SecurityError') {
    return {
      code: 'SECURITY_ERROR',
      message:
        'Media access is blocked on insecure origins. Use HTTPS or localhost.',
    };
  }

  return {
    code: 'MEDIA_ERROR',
    message: `Failed to access media devices: ${message}`,
  };
}

function stopStreamTracks(stream) {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    track.stop();
  });
}

/**
 * Reusable 1-to-1 WebRTC hook (media + peer connection only).
 * Signaling (Socket.IO emit/on) stays in the caller for now.
 *
 * @param {object} [options]
 * @param {RTCIceServer[]} [options.iceServers]
 * @param {MediaStreamConstraints} [options.mediaConstraints]
 * @param {(candidate: RTCIceCandidate) => void} [options.onIceCandidate]
 * @param {(state: RTCPeerConnectionState) => void} [options.onConnectionStateChange]
 * @param {(error: { code: string, message: string }) => void} [options.onError]
 */
export function useWebRTC(options = {}) {
  const {
    iceServers = DEFAULT_ICE_SERVERS,
    mediaConstraints = DEFAULT_MEDIA_CONSTRAINTS,
    onIceCandidate = null,
    onConnectionStateChange = null,
    onError = null,
  } = options;

  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [peerConnection, setPeerConnection] = useState(null);
  const [error, setError] = useState(null);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [connectionState, setConnectionState] = useState('new');

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const isCleaningUpRef = useRef(false);

  // Keep latest callbacks without re-binding PC listeners on every render
  const onIceCandidateRef = useRef(onIceCandidate);
  const onConnectionStateChangeRef = useRef(onConnectionStateChange);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onIceCandidateRef.current = onIceCandidate;
  }, [onIceCandidate]);

  useEffect(() => {
    onConnectionStateChangeRef.current = onConnectionStateChange;
  }, [onConnectionStateChange]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const reportError = useCallback((mapped) => {
    setError(mapped);
    onErrorRef.current?.(mapped);
  }, []);

  const clearPeerListeners = useCallback((pc) => {
    if (!pc) return;
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    pc.oniceconnectionstatechange = null;
    pc.onsignalingstatechange = null;
    pc.onnegotiationneeded = null;
    pc.onicegatheringstatechange = null;
  }, []);

  const flushPendingCandidates = useCallback(async (pc) => {
    if (!pc?.remoteDescription || pendingCandidatesRef.current.length === 0) {
      return;
    }

    const queued = [...pendingCandidatesRef.current];
    pendingCandidatesRef.current = [];

    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('[useWebRTC] Failed to add queued ICE candidate:', err);
      }
    }
  }, []);

  const createPeerConnection = useCallback(() => {
    if (pcRef.current) {
      return pcRef.current;
    }

    const pc = new RTCPeerConnection({ iceServers });

    pc.onicecandidate = (event) => {
      if (event.candidate && onIceCandidateRef.current) {
        onIceCandidateRef.current(event.candidate);
      }
    };

    pc.ontrack = (event) => {
      if (isCleaningUpRef.current) return;

      let stream = remoteStreamRef.current;

      if (event.streams?.[0]) {
        stream = event.streams[0];
      } else {
        if (!stream) {
          stream = new MediaStream();
        }
        // Avoid duplicate track inserts when renegotiating
        const alreadyHasTrack = stream.getTracks().some((t) => t.id === event.track.id);
        if (!alreadyHasTrack) {
          stream.addTrack(event.track);
        }
      }

      remoteStreamRef.current = stream;
      setRemoteStream(stream);
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      setConnectionState(state);
      onConnectionStateChangeRef.current?.(state);

      if (state === 'failed') {
        reportError({
          code: 'CONNECTION_FAILED',
          message: 'Peer connection failed. Check network or ICE/TURN configuration.',
        });
      }
    };

    pcRef.current = pc;
    setPeerConnection(pc);
    return pc;
  }, [iceServers, reportError]);

  const attachLocalTracks = useCallback((pc, stream) => {
    if (!pc || !stream) return;

    const senders = pc.getSenders();
    const senderTrackIds = new Set(senders.map((s) => s.track?.id).filter(Boolean));

    stream.getTracks().forEach((track) => {
      if (!senderTrackIds.has(track.id)) {
        pc.addTrack(track, stream);
      }
    });
  }, []);

  /**
   * 1–3. Request camera/mic, create RTCPeerConnection, add local tracks.
   */
  const startMedia = useCallback(async () => {
    isCleaningUpRef.current = false;
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      const mapped = {
        code: 'UNSUPPORTED',
        message: 'This browser does not support camera/microphone access (getUserMedia).',
      };
      reportError(mapped);
      throw Object.assign(new Error(mapped.message), mapped);
    }

    try {
      // Reuse an existing live local stream if present
      if (!localStreamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        localStreamRef.current = stream;
        setLocalStream(stream);

        const audioTrack = stream.getAudioTracks()[0];
        const videoTrack = stream.getVideoTracks()[0];
        setIsMicEnabled(audioTrack ? audioTrack.enabled : false);
        setIsCameraEnabled(videoTrack ? videoTrack.enabled : false);

        if (!audioTrack && !videoTrack) {
          const mapped = {
            code: 'DEVICE_NOT_FOUND',
            message: 'No usable audio or video tracks were returned by the device.',
          };
          reportError(mapped);
          throw Object.assign(new Error(mapped.message), mapped);
        }
      }

      const pc = createPeerConnection();
      attachLocalTracks(pc, localStreamRef.current);

      return localStreamRef.current;
    } catch (err) {
      if (err?.code) throw err;
      const mapped = mapMediaError(err);
      reportError(mapped);
      throw Object.assign(new Error(mapped.message), mapped);
    }
  }, [attachLocalTracks, createPeerConnection, mediaConstraints, reportError]);

  /**
   * 5. Create SDP offer (caller).
   */
  const createOffer = useCallback(
    async (offerOptions = { offerToReceiveAudio: true, offerToReceiveVideo: true }) => {
      await startMedia();
      const pc = pcRef.current;
      if (!pc) {
        throw new Error('Peer connection is not available.');
      }

      const offer = await pc.createOffer(offerOptions);
      await pc.setLocalDescription(offer);
      return pc.localDescription;
    },
    [startMedia]
  );

  /**
   * 6a. Apply remote offer (callee).
   */
  const handleOffer = useCallback(
    async (offer) => {
      if (!offer) {
        throw new Error('Missing remote offer.');
      }

      await startMedia();
      const pc = pcRef.current;
      if (!pc) {
        throw new Error('Peer connection is not available.');
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await flushPendingCandidates(pc);
      return pc.remoteDescription;
    },
    [flushPendingCandidates, startMedia]
  );

  /**
   * 6b. Create SDP answer after a remote offer is set (callee).
   */
  const createAnswer = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) {
      throw new Error('Peer connection is not available. Call handleOffer() first.');
    }

    if (!pc.remoteDescription) {
      throw new Error('Cannot create answer before a remote offer is applied.');
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return pc.localDescription;
  }, []);

  /**
   * Apply remote answer (caller).
   */
  const handleAnswer = useCallback(
    async (answer) => {
      const pc = pcRef.current;
      if (!pc) {
        throw new Error('Peer connection is not available.');
      }
      if (!answer) {
        throw new Error('Missing remote answer.');
      }

      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      await flushPendingCandidates(pc);
      return pc.remoteDescription;
    },
    [flushPendingCandidates]
  );

  /**
   * 7. Apply a remote ICE candidate (queue if remote description is not ready yet).
   */
  const handleIceCandidate = useCallback(async (candidate) => {
    if (!candidate) return;

    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) {
      pendingCandidatesRef.current.push(candidate);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('[useWebRTC] Failed to add ICE candidate:', err);
      reportError({
        code: 'ICE_CANDIDATE_ERROR',
        message: err?.message || 'Failed to add ICE candidate.',
      });
    }
  }, [reportError]);

  const toggleMicrophone = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return false;

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return false;

    audioTrack.enabled = !audioTrack.enabled;
    setIsMicEnabled(audioTrack.enabled);
    return audioTrack.enabled;
  }, []);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return false;

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return false;

    videoTrack.enabled = !videoTrack.enabled;
    setIsCameraEnabled(videoTrack.enabled);
    return videoTrack.enabled;
  }, []);

  /**
   * 10–11 & 14. Stop tracks, close PC, clear listeners and state.
   */
  const endCall = useCallback(() => {
    isCleaningUpRef.current = true;
    pendingCandidatesRef.current = [];

    const pc = pcRef.current;
    if (pc) {
      try {
        pc.getSenders().forEach((sender) => {
          try {
            if (sender.track) sender.track.stop();
          } catch {
            // ignore sender track stop errors during teardown
          }
        });
      } catch {
        // ignore
      }

      clearPeerListeners(pc);

      if (pc.connectionState !== 'closed') {
        pc.close();
      }
    }

    stopStreamTracks(localStreamRef.current);
    stopStreamTracks(remoteStreamRef.current);

    localStreamRef.current = null;
    remoteStreamRef.current = null;
    pcRef.current = null;

    setLocalStream(null);
    setRemoteStream(null);
    setPeerConnection(null);
    setConnectionState('closed');
    setIsMicEnabled(true);
    setIsCameraEnabled(true);
    setError(null);
  }, [clearPeerListeners]);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      endCall();
    };
  }, [endCall]);

  return {
    localStream,
    remoteStream,
    peerConnection,
    error,
    isMicEnabled,
    isCameraEnabled,
    connectionState,
    startMedia,
    createOffer,
    createAnswer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    endCall,
    toggleMicrophone,
    toggleCamera,
  };
}

export default useWebRTC;
