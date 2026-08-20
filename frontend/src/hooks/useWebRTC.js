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

const QUALITY_UNKNOWN = { level: 'unknown', rttMs: null, packetLoss: null };

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
      message: 'No camera or microphone was found. Connect a device and try again.',
    };
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return {
      code: 'DEVICE_IN_USE',
      message: 'Camera or microphone is already in use by another application.',
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
      message: 'Media access is blocked on insecure origins. Use HTTPS or localhost.',
    };
  }

  return {
    code: 'MEDIA_ERROR',
    message: `Failed to access media devices: ${message}`,
  };
}

function mapDisplayMediaError(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return {
      code: 'SCREEN_PERMISSION_DENIED',
      message: 'Screen share permission was denied.',
    };
  }
  if (name === 'NotFoundError') {
    return {
      code: 'SCREEN_NOT_FOUND',
      message: 'No screen or window was available to share.',
    };
  }
  return {
    code: 'SCREEN_SHARE_ERROR',
    message: err?.message || 'Failed to start screen sharing.',
  };
}

function stopStreamTracks(stream) {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    track.stop();
  });
}

function qualityFromStats(rttSeconds, packetLoss) {
  const rttMs = typeof rttSeconds === 'number' ? Math.round(rttSeconds * 1000) : null;
  const loss = typeof packetLoss === 'number' ? packetLoss : null;

  if (rttMs == null && loss == null) return { ...QUALITY_UNKNOWN };

  let level = 'excellent';
  if ((rttMs != null && rttMs > 400) || (loss != null && loss > 0.08)) level = 'poor';
  else if ((rttMs != null && rttMs > 250) || (loss != null && loss > 0.04)) level = 'fair';
  else if ((rttMs != null && rttMs > 150) || (loss != null && loss > 0.02)) level = 'good';

  return { level, rttMs, packetLoss: loss };
}

/**
 * Reusable 1-to-1 WebRTC hook (media + peer connection only).
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
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [connectionState, setConnectionState] = useState('new');
  const [iceConnectionState, setIceConnectionState] = useState('new');
  const [connectionQuality, setConnectionQuality] = useState(QUALITY_UNKNOWN);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const cameraTrackRef = useRef(null);
  const screenStreamRef = useRef(null);
  const videoSenderRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const isCleaningUpRef = useRef(false);
  const packetsBaselineRef = useRef({ lost: 0, received: 0 });

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

  const refreshLocalPreview = useCallback((stream) => {
    localStreamRef.current = stream;
    // New MediaStream identity so React consumers re-bind srcObject when tracks change
    setLocalStream(stream ? new MediaStream(stream.getTracks()) : null);
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
        const alreadyHasTrack = stream.getTracks().some((t) => t.id === event.track.id);
        if (!alreadyHasTrack) {
          stream.addTrack(event.track);
        }
      }

      event.track.onended = () => {
        if (isCleaningUpRef.current) return;
        const current = remoteStreamRef.current;
        if (!current) return;
        setRemoteStream(new MediaStream(current.getTracks().filter((t) => t.readyState !== 'ended')));
      };

      remoteStreamRef.current = stream;
      setRemoteStream(new MediaStream(stream.getTracks()));
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      setConnectionState(state);
      onConnectionStateChangeRef.current?.(state);

      if (state === 'failed') {
        reportError({
          code: 'CONNECTION_FAILED',
          message: 'Peer connection failed. Check your network and try calling again.',
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      setIceConnectionState(pc.iceConnectionState);
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
      if (!localStreamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        const audioTrack = stream.getAudioTracks()[0];
        const videoTrack = stream.getVideoTracks()[0];

        if (videoTrack) {
          cameraTrackRef.current = videoTrack;
        }

        refreshLocalPreview(stream);
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
  }, [attachLocalTracks, createPeerConnection, mediaConstraints, refreshLocalPreview, reportError]);

  const createOffer = useCallback(
    async (offerOptions = { offerToReceiveAudio: true, offerToReceiveVideo: true }) => {
      await startMedia();
      const pc = pcRef.current;
      if (!pc) throw new Error('Peer connection is not available.');

      const offer = await pc.createOffer(offerOptions);
      await pc.setLocalDescription(offer);
      return pc.localDescription;
    },
    [startMedia]
  );

  const handleOffer = useCallback(
    async (offer) => {
      if (!offer) throw new Error('Missing remote offer.');

      await startMedia();
      const pc = pcRef.current;
      if (!pc) throw new Error('Peer connection is not available.');

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await flushPendingCandidates(pc);
      return pc.remoteDescription;
    },
    [flushPendingCandidates, startMedia]
  );

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

  const handleAnswer = useCallback(
    async (answer) => {
      const pc = pcRef.current;
      if (!pc) throw new Error('Peer connection is not available.');
      if (!answer) throw new Error('Missing remote answer.');

      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      await flushPendingCandidates(pc);
      return pc.remoteDescription;
    },
    [flushPendingCandidates]
  );

  const handleIceCandidate = useCallback(
    async (candidate) => {
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
    },
    [reportError]
  );

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
    if (isScreenSharing) return isCameraEnabled;

    const stream = localStreamRef.current;
    if (!stream) return false;

    const videoTrack = stream.getVideoTracks()[0] || cameraTrackRef.current;
    if (!videoTrack) return false;

    videoTrack.enabled = !videoTrack.enabled;
    setIsCameraEnabled(videoTrack.enabled);
    refreshLocalPreview(localStreamRef.current);
    return videoTrack.enabled;
  }, [isCameraEnabled, isScreenSharing, refreshLocalPreview]);

  const stopScreenShare = useCallback(async () => {
    const cameraTrack = cameraTrackRef.current;
    const liveCamera = cameraTrack && cameraTrack.readyState === 'live' ? cameraTrack : null;
    const videoSender =
      videoSenderRef.current ||
      pcRef.current?.getSenders().find((sender) => sender.track?.kind === 'video') ||
      null;

    if (videoSender) {
      try {
        await videoSender.replaceTrack(liveCamera);
      } catch (err) {
        console.error('[useWebRTC] Failed to restore camera track:', err);
      }
    }

    if (screenStreamRef.current) {
      stopStreamTracks(screenStreamRef.current);
      screenStreamRef.current = null;
    }

    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      const nextTracks = [...audioTracks];
      if (liveCamera) nextTracks.push(liveCamera);
      refreshLocalPreview(new MediaStream(nextTracks));
    }

    setIsScreenSharing(false);
    setIsCameraEnabled(Boolean(liveCamera?.enabled));
  }, [refreshLocalPreview]);

  const startScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) {
      const mapped = {
        code: 'NO_PEER_CONNECTION',
        message: 'Connect the call before sharing your screen.',
      };
      reportError(mapped);
      throw Object.assign(new Error(mapped.message), mapped);
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      const mapped = {
        code: 'SCREEN_UNSUPPORTED',
        message: 'Screen sharing is not supported in this browser.',
      };
      reportError(mapped);
      throw Object.assign(new Error(mapped.message), mapped);
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const screenTrack = screenStream.getVideoTracks()[0];
      if (!screenTrack) {
        stopStreamTracks(screenStream);
        throw Object.assign(new Error('No screen video track available.'), {
          code: 'SCREEN_NOT_FOUND',
        });
      }

      const currentVideo =
        localStreamRef.current?.getVideoTracks()[0] || cameraTrackRef.current || null;
      if (currentVideo && currentVideo !== screenTrack) {
        cameraTrackRef.current = currentVideo;
      }

      const videoSender = pc.getSenders().find((sender) => sender.track?.kind === 'video');
      if (!videoSender) {
        stopStreamTracks(screenStream);
        throw Object.assign(new Error('No video sender available on the peer connection.'), {
          code: 'NO_VIDEO_SENDER',
        });
      }

      await videoSender.replaceTrack(screenTrack);
      videoSenderRef.current = videoSender;
      screenStreamRef.current = screenStream;

      const audioTracks = localStreamRef.current?.getAudioTracks() || [];
      refreshLocalPreview(new MediaStream([...audioTracks, screenTrack]));
      setIsScreenSharing(true);

      screenTrack.onended = () => {
        stopScreenShare();
      };

      return screenStream;
    } catch (err) {
      if (err?.code) {
        reportError({ code: err.code, message: err.message });
        throw err;
      }
      const mapped = mapDisplayMediaError(err);
      reportError(mapped);
      throw Object.assign(new Error(mapped.message), mapped);
    }
  }, [refreshLocalPreview, reportError, stopScreenShare]);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      await stopScreenShare();
      return false;
    }
    await startScreenShare();
    return true;
  }, [isScreenSharing, startScreenShare, stopScreenShare]);

  // Poll real WebRTC stats for connection quality
  useEffect(() => {
    if (!peerConnection) {
      setConnectionQuality(QUALITY_UNKNOWN);
      packetsBaselineRef.current = { lost: 0, received: 0 };
      return undefined;
    }

    let cancelled = false;

    const sample = async () => {
      const pc = pcRef.current;
      if (!pc || cancelled || pc.connectionState === 'closed') return;

      try {
        const stats = await pc.getStats();
        let rtt = null;
        let lost = 0;
        let received = 0;

        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            if (typeof report.currentRoundTripTime === 'number') {
              rtt = report.currentRoundTripTime;
            }
          }
          if (report.type === 'inbound-rtp' && !report.isRemote) {
            lost += report.packetsLost || 0;
            received += report.packetsReceived || 0;
          }
        });

        const baseline = packetsBaselineRef.current;
        const deltaLost = Math.max(0, lost - baseline.lost);
        const deltaReceived = Math.max(0, received - baseline.received);
        packetsBaselineRef.current = { lost, received };

        const totalDelta = deltaLost + deltaReceived;
        const lossRate = totalDelta > 0 ? deltaLost / totalDelta : null;

        if (!cancelled) {
          setConnectionQuality(qualityFromStats(rtt, lossRate));
        }
      } catch {
        // Stats can fail briefly during ICE restarts; ignore.
      }
    };

    sample();
    const intervalId = window.setInterval(sample, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [peerConnection]);

  const endCall = useCallback(() => {
    isCleaningUpRef.current = true;
    pendingCandidatesRef.current = [];
    packetsBaselineRef.current = { lost: 0, received: 0 };

    if (screenStreamRef.current) {
      stopStreamTracks(screenStreamRef.current);
      screenStreamRef.current = null;
    }

    const pc = pcRef.current;
    if (pc) {
      try {
        pc.getSenders().forEach((sender) => {
          try {
            if (sender.track) sender.track.stop();
          } catch {
            // ignore
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

    if (cameraTrackRef.current && cameraTrackRef.current.readyState !== 'ended') {
      try {
        cameraTrackRef.current.stop();
      } catch {
        // ignore
      }
    }

    localStreamRef.current = null;
    remoteStreamRef.current = null;
    cameraTrackRef.current = null;
    videoSenderRef.current = null;
    pcRef.current = null;

    setLocalStream(null);
    setRemoteStream(null);
    setPeerConnection(null);
    setConnectionState('closed');
    setIceConnectionState('closed');
    setIsMicEnabled(true);
    setIsCameraEnabled(true);
    setIsScreenSharing(false);
    setConnectionQuality(QUALITY_UNKNOWN);
    setError(null);
  }, [clearPeerListeners]);

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
    isScreenSharing,
    connectionState,
    iceConnectionState,
    connectionQuality,
    startMedia,
    createOffer,
    createAnswer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    endCall,
    toggleMicrophone,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    toggleScreenShare,
  };
}

export default useWebRTC;
