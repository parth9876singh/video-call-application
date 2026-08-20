import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { useWebRTC } from '../hooks/useWebRTC';

/** @typedef {'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'ended'} CallStatus */

const CallContext = createContext(null);

const INITIAL_STATE = {
  status: /** @type {CallStatus} */ ('idle'),
  callId: null,
  role: null, // 'caller' | 'receiver'
  remoteUser: null,
  error: null,
};

const INITIATE_ERROR_MESSAGES = {
  SELF_CALL: 'You cannot call yourself.',
  RECEIVER_OFFLINE: 'The receiver is offline.',
  RECEIVER_BUSY: 'The receiver is already in a call.',
  CALLER_BUSY: 'You are already in a call.',
  RECEIVER_NOT_FOUND: 'Receiver user not found.',
  INVALID_RECEIVER: 'Invalid receiver.',
  UNAUTHORIZED: 'Not authorized to start this call.',
};

export const CallProvider = ({ children }) => {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [callState, setCallState] = useState(INITIAL_STATE);
  const callStateRef = useRef(callState);
  const offerSentRef = useRef(false);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  const resetCallState = useCallback((error = null) => {
    offerSentRef.current = false;
    const next = {
      ...INITIAL_STATE,
      error,
    };
    callStateRef.current = next;
    setCallState(next);
  }, []);

  const patchCallState = useCallback((patch) => {
    const next = { ...callStateRef.current, ...patch };
    callStateRef.current = next;
    setCallState(next);
  }, []);

  const sendIceCandidate = useCallback(
    (candidate) => {
      const { callId, status } = callStateRef.current;
      if (!socket || !callId || !candidate) return;
      if (!['connecting', 'active'].includes(status)) return;

      socket.emit('call:ice-candidate', {
        callId,
        candidate: {
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
          usernameFragment: candidate.usernameFragment,
        },
      });
    },
    [socket]
  );

  const {
    localStream,
    remoteStream,
    error: mediaError,
    isMicEnabled,
    isCameraEnabled,
    connectionState,
    createOffer,
    createAnswer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    endCall: cleanupWebRTC,
    toggleMicrophone,
    toggleCamera,
  } = useWebRTC({
    onIceCandidate: sendIceCandidate,
    onConnectionStateChange: (state) => {
      if (state !== 'connected') return;
      const prev = callStateRef.current;
      if (prev.status !== 'connecting' && prev.status !== 'active') return;
      const next = { ...prev, status: 'active', error: null };
      callStateRef.current = next;
      setCallState(next);
    },
  });

  const cleanupWebRTCRef = useRef(cleanupWebRTC);
  useEffect(() => {
    cleanupWebRTCRef.current = cleanupWebRTC;
  }, [cleanupWebRTC]);

  const teardownLocalCall = useCallback(
    (error = null) => {
      cleanupWebRTCRef.current();
      resetCallState(error);
    },
    [resetCallState]
  );

  const initiateCall = useCallback(
    async (receiver) => {
      if (!socket?.connected) {
        patchCallState({
          error: { code: 'SOCKET_DISCONNECTED', message: 'Not connected to signaling server.' },
        });
        return { success: false };
      }

      if (!receiver?._id) {
        return { success: false, code: 'INVALID_RECEIVER' };
      }

      if (user?._id && receiver._id.toString() === user._id.toString()) {
        patchCallState({
          error: { code: 'SELF_CALL', message: 'You cannot call yourself.' },
        });
        return { success: false, code: 'SELF_CALL' };
      }

      if (callStateRef.current.status !== 'idle') {
        patchCallState({
          error: { code: 'BUSY', message: 'You are already in a call.' },
        });
        return { success: false, code: 'BUSY' };
      }

      patchCallState({
        status: 'outgoing',
        callId: null,
        role: 'caller',
        remoteUser: {
          _id: receiver._id,
          name: receiver.name,
          email: receiver.email,
          avatar: receiver.avatar,
        },
        error: null,
      });

      return new Promise((resolve) => {
        socket.emit(
          'call:initiate',
          { receiverId: receiver._id.toString() },
          (response) => {
            if (!response?.success) {
              const code = response?.code || 'INITIATE_FAILED';
              teardownLocalCall({
                code,
                message: INITIATE_ERROR_MESSAGES[code] || 'Failed to start call.',
              });
              resolve({ success: false, code });
              return;
            }

            patchCallState({
              callId: response.callId,
              status: 'outgoing',
              role: 'caller',
            });
            resolve({ success: true, callId: response.callId });
          }
        );
      });
    },
    [socket, teardownLocalCall, user, patchCallState]
  );

  const acceptCall = useCallback(() => {
    const { callId, status } = callStateRef.current;
    if (!socket || !callId || status !== 'incoming') return;

    socket.emit('call:accept', { callId }, (response) => {
      if (!response?.success) {
        teardownLocalCall({
          code: response?.code || 'ACCEPT_FAILED',
          message: 'Failed to accept call.',
        });
        return;
      }

      patchCallState({
        status: 'connecting',
        error: null,
      });
    });
  }, [socket, teardownLocalCall, patchCallState]);

  const rejectCall = useCallback(() => {
    const { callId, status } = callStateRef.current;
    if (!socket || !callId || status !== 'incoming') {
      teardownLocalCall();
      return;
    }

    socket.emit('call:reject', { callId }, () => {
      teardownLocalCall();
    });
  }, [socket, teardownLocalCall]);

  const endCall = useCallback(() => {
    const { callId, status } = callStateRef.current;
    if (socket && callId && status !== 'idle') {
      socket.emit('call:end', { callId });
    }
    teardownLocalCall();
  }, [socket, teardownLocalCall]);

  // Signaling listeners
  useEffect(() => {
    if (!socket) return undefined;

    const onRinging = (payload) => {
      if (!payload?.callId || !payload?.caller || !payload?.receiver) return;

      const myId = user?._id?.toString();
      const isCaller = payload.caller._id === myId;
      const isReceiver = payload.receiver._id === myId;
      if (!isCaller && !isReceiver) return;

      patchCallState({
        status: isCaller ? 'outgoing' : 'incoming',
        callId: payload.callId,
        role: isCaller ? 'caller' : 'receiver',
        remoteUser: isCaller ? payload.receiver : payload.caller,
        error: null,
      });
    };

    const onAccept = async (payload) => {
      if (!payload?.callId) return;
      if (callStateRef.current.callId && callStateRef.current.callId !== payload.callId) return;

      patchCallState({
        callId: payload.callId,
        status: 'connecting',
        error: null,
      });

      // Only the caller creates/sends the WebRTC offer after accept
      if (callStateRef.current.role !== 'caller' || offerSentRef.current) return;

      offerSentRef.current = true;
      try {
        const offer = await createOffer();
        socket.emit('call:offer', {
          callId: payload.callId,
          offer: { type: offer.type, sdp: offer.sdp },
        });
      } catch (err) {
        offerSentRef.current = false;
        socket.emit('call:end', { callId: payload.callId });
        teardownLocalCall({
          code: err?.code || 'OFFER_FAILED',
          message: err?.message || 'Failed to create WebRTC offer.',
        });
      }
    };

    const onReject = (payload) => {
      if (!payload?.callId) return;
      if (callStateRef.current.callId && callStateRef.current.callId !== payload.callId) return;
      teardownLocalCall({
        code: 'REJECTED',
        message: 'Call was rejected.',
      });
    };

    const onOffer = async (payload) => {
      if (!payload?.callId || !payload?.offer) return;
      if (callStateRef.current.callId && callStateRef.current.callId !== payload.callId) return;
      if (callStateRef.current.role !== 'receiver') return;

      try {
        patchCallState({ status: 'connecting', error: null });
        await handleOffer(payload.offer);
        const answer = await createAnswer();
        socket.emit('call:answer', {
          callId: payload.callId,
          answer: { type: answer.type, sdp: answer.sdp },
        });
      } catch (err) {
        socket.emit('call:end', { callId: payload.callId });
        teardownLocalCall({
          code: err?.code || 'ANSWER_FAILED',
          message: err?.message || 'Failed to handle offer / create answer.',
        });
      }
    };

    const onAnswer = async (payload) => {
      if (!payload?.callId || !payload?.answer) return;
      if (callStateRef.current.callId && callStateRef.current.callId !== payload.callId) return;
      if (callStateRef.current.role !== 'caller') return;

      try {
        await handleAnswer(payload.answer);
      } catch (err) {
        socket.emit('call:end', { callId: payload.callId });
        teardownLocalCall({
          code: err?.code || 'ANSWER_APPLY_FAILED',
          message: err?.message || 'Failed to apply remote answer.',
        });
      }
    };

    const onIce = async (payload) => {
      if (!payload?.callId || !payload?.candidate) return;
      if (callStateRef.current.callId && callStateRef.current.callId !== payload.callId) return;

      try {
        await handleIceCandidate(payload.candidate);
      } catch (err) {
        console.error('[Call] Failed to apply remote ICE candidate:', err);
      }
    };

    const onEnd = (payload) => {
      if (!payload?.callId) return;
      if (callStateRef.current.callId && callStateRef.current.callId !== payload.callId) return;
      teardownLocalCall(
        payload.reason === 'peer_disconnected'
          ? { code: 'PEER_DISCONNECTED', message: 'The other participant disconnected.' }
          : null
      );
    };

    const onError = (payload) => {
      const message = payload?.message || 'Call signaling error.';
      const code = payload?.code || 'CALL_ERROR';

      // Fatal setup errors should reset UI
      if (
        ['SELF_CALL', 'RECEIVER_OFFLINE', 'RECEIVER_BUSY', 'CALLER_BUSY', 'UNAUTHORIZED', 'RECEIVER_NOT_FOUND'].includes(
          code
        )
      ) {
        teardownLocalCall({ code, message });
        return;
      }

      setCallState((prev) => ({
        ...prev,
        error: { code, message },
      }));
    };

    socket.on('call:ringing', onRinging);
    socket.on('call:accept', onAccept);
    socket.on('call:reject', onReject);
    socket.on('call:offer', onOffer);
    socket.on('call:answer', onAnswer);
    socket.on('call:ice-candidate', onIce);
    socket.on('call:end', onEnd);
    socket.on('call:error', onError);

    return () => {
      socket.off('call:ringing', onRinging);
      socket.off('call:accept', onAccept);
      socket.off('call:reject', onReject);
      socket.off('call:offer', onOffer);
      socket.off('call:answer', onAnswer);
      socket.off('call:ice-candidate', onIce);
      socket.off('call:end', onEnd);
      socket.off('call:error', onError);
    };
  }, [
    socket,
    user?._id,
    createOffer,
    createAnswer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    teardownLocalCall,
    patchCallState,
  ]);

  // Clear stale errors when returning to idle after a short delay
  useEffect(() => {
    if (callState.status !== 'idle' || !callState.error) return undefined;
    const timer = setTimeout(() => {
      setCallState((prev) => (prev.status === 'idle' ? { ...prev, error: null } : prev));
    }, 4000);
    return () => clearTimeout(timer);
  }, [callState.status, callState.error]);

  const value = useMemo(
    () => ({
      status: callState.status,
      callId: callState.callId,
      role: callState.role,
      remoteUser: callState.remoteUser,
      error: callState.error || mediaError,
      isInCall: callState.status !== 'idle',
      localStream,
      remoteStream,
      isMicEnabled,
      isCameraEnabled,
      connectionState,
      initiateCall,
      acceptCall,
      rejectCall,
      endCall,
      toggleMicrophone,
      toggleCamera,
      clearError: () => patchCallState({ error: null }),
    }),
    [
      callState,
      mediaError,
      localStream,
      remoteStream,
      isMicEnabled,
      isCameraEnabled,
      connectionState,
      initiateCall,
      acceptCall,
      rejectCall,
      endCall,
      toggleMicrophone,
      toggleCamera,
      patchCallState,
    ]
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
};

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
};
