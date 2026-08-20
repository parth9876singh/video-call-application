import { createContext, useContext, useEffect, useRef, useCallback, useReducer } from 'react';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';

// ─────────────────────────────────────────────
// State machine for call lifecycle
// ─────────────────────────────────────────────
const CALL_STATUS = {
  IDLE: 'idle',
  RINGING_OUTGOING: 'ringing_outgoing', // We initiated, waiting for answer
  RINGING_INCOMING: 'ringing_incoming', // Someone is calling us
  ACTIVE: 'active',                     // Call connected
};

const initialState = {
  status: CALL_STATUS.IDLE,
  callId: null,
  caller: null,     // { id, name, avatar, email } — populated on incoming
  receiver: null,   // { id, name, avatar } — populated on accept
  callType: 'video',
  startedAt: null,
};

const callReducer = (state, action) => {
  switch (action.type) {
    case 'OUTGOING_CALL':
      return { ...initialState, status: CALL_STATUS.RINGING_OUTGOING, callId: action.callId, callType: action.callType, receiver: action.receiver };
    case 'INCOMING_CALL':
      return { ...initialState, status: CALL_STATUS.RINGING_INCOMING, callId: action.callId, callType: action.callType, caller: action.caller };
    case 'CALL_ACTIVE':
      return { ...state, status: CALL_STATUS.ACTIVE, startedAt: new Date(), receiver: action.receiver || state.receiver };
    case 'RESET':
      return { ...initialState };
    default:
      return state;
  }
};

// ─────────────────────────────────────────────
// Ringtone using Web Audio API (no external file needed)
// ─────────────────────────────────────────────
const createRingtone = () => {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;

  let ctx = null;
  let intervalId = null;
  let isPlaying = false;

  const playBeep = () => {
    if (!ctx) return;
    try {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.frequency.setValueAtTime(520, ctx.currentTime);
      oscillator.frequency.setValueAtTime(440, ctx.currentTime + 0.3);
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.6);
    } catch (e) { /* ignore if context suspended */ }
  };

  return {
    start() {
      if (isPlaying) return;
      try {
        ctx = new AudioContext();
        isPlaying = true;
        playBeep();
        intervalId = setInterval(playBeep, 1800);
      } catch (e) {
        console.warn('[Ringtone] AudioContext error:', e);
      }
    },
    stop() {
      if (!isPlaying) return;
      isPlaying = false;
      clearInterval(intervalId);
      intervalId = null;
      try { ctx?.close(); } catch (e) { /* ignore */ }
      ctx = null;
    },
  };
};

const CallContext = createContext(null);
const RING_TIMEOUT_MS = 30_000; // Auto-timeout after 30s

export const CallProvider = ({ children }) => {
  const { socket } = useSocket();
  const { user } = useAuth();
  const [callState, dispatch] = useReducer(callReducer, initialState);

  const ringtoneRef = useRef(null);
  const timeoutRef = useRef(null);
  const callStatusRef = useRef(callState.status);
  callStatusRef.current = callState.status;

  const getRingtone = useCallback(() => {
    if (!ringtoneRef.current) {
      ringtoneRef.current = createRingtone();
    }
    return ringtoneRef.current;
  }, []);

  const stopRingtone = useCallback(() => {
    getRingtone()?.stop();
  }, [getRingtone]);

  const clearCallTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const resetCallState = useCallback(() => {
    stopRingtone();
    clearCallTimeout();
    dispatch({ type: 'RESET' });
  }, [stopRingtone, clearCallTimeout]);

  // ─────────────────────────────────────────────
  // Outgoing call actions
  // ─────────────────────────────────────────────
  const initiateCall = useCallback((targetUser, callType = 'video') => {
    if (!socket) return;
    if (callStatusRef.current !== CALL_STATUS.IDLE) return;

    let targetUserId = typeof targetUser === 'string'
      ? targetUser
      : (targetUser?.id || targetUser?._id || targetUser?.userId);

    if (targetUserId && typeof targetUserId === 'object' && targetUserId.toString) {
      targetUserId = targetUserId.toString();
    }

    if (!targetUserId || typeof targetUserId !== 'string' || !targetUserId.trim()) {
      console.error('[CallContext] Cannot initiate call: Valid receiverId is required.', targetUser);
      return;
    }

    const cleanId = targetUserId.toString().trim();

    // Transition caller state to OUTGOING_CALL
    dispatch({
      type: 'OUTGOING_CALL',
      callId: null,
      callType,
      receiver: typeof targetUser === 'object' ? targetUser : { id: cleanId },
    });
    getRingtone().start();

    // Auto-timeout if receiver never answers
    clearCallTimeout();
    timeoutRef.current = setTimeout(() => {
      resetCallState();
    }, RING_TIMEOUT_MS);

    socket.emit('call:initiate', {
      targetUserId: cleanId,
      receiverId: cleanId,
      target: cleanId,
      callType,
    });
  }, [socket, getRingtone, clearCallTimeout, resetCallState]);

  const cancelCall = useCallback(() => {
    if (!socket || !callState.callId) return;
    socket.emit('call:cancel', { callId: callState.callId });
    resetCallState();
  }, [socket, callState.callId, resetCallState]);

  const endCall = useCallback(() => {
    if (!socket || !callState.callId) return;
    socket.emit('call:end', { callId: callState.callId });
    resetCallState();
  }, [socket, callState.callId, resetCallState]);

  // ─────────────────────────────────────────────
  // Incoming call actions
  // ─────────────────────────────────────────────
  const acceptCall = useCallback(() => {
    if (!socket || !callState.callId) return;
    socket.emit('call:accept', { callId: callState.callId });
    stopRingtone();
    clearCallTimeout();
    dispatch({ type: 'CALL_ACTIVE' });
  }, [socket, callState.callId, stopRingtone, clearCallTimeout]);

  const rejectCall = useCallback(() => {
    if (!socket || !callState.callId) return;
    socket.emit('call:reject', { callId: callState.callId });
    resetCallState();
  }, [socket, callState.callId, resetCallState]);

  // ─────────────────────────────────────────────
  // Socket event listeners
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    // Caller: server confirms call created
    const onRinging = ({ callId }) => {
      dispatch({
        type: 'OUTGOING_CALL',
        callId,
        callType: 'video',
        receiver: callState.receiver || {},
      });
    };

    // Receiver: incoming call
    const onIncoming = ({ callId, callType, caller }) => {
      // If already in a call, reject
      if (callStatusRef.current !== CALL_STATUS.IDLE) {
        socket.emit('call:reject', { callId });
        return;
      }

      dispatch({ type: 'INCOMING_CALL', callId, callType, caller });
      getRingtone().start();

      clearCallTimeout();
      timeoutRef.current = setTimeout(() => {
        socket.emit('call:reject', { callId });
        resetCallState();
      }, RING_TIMEOUT_MS);
    };

    // Caller: receiver accepted
    const onAccepted = ({ callId, receiver }) => {
      stopRingtone();
      clearCallTimeout();
      dispatch({ type: 'CALL_ACTIVE', receiver });
    };

    // Caller: receiver rejected
    const onRejected = () => {
      resetCallState();
    };

    // Receiver: caller cancelled before answer
    const onCancelled = () => {
      resetCallState();
    };

    // Either side: call ended
    const onEnded = () => {
      resetCallState();
    };

    // Either side: peer disconnected
    const onPeerDisconnected = () => {
      resetCallState();
    };

    // Error handler
    const onError = ({ message }) => {
      console.warn('[CallContext] Call error:', message);
      resetCallState();
    };

    socket.on('call:ringing', onRinging);
    socket.on('call:incoming', onIncoming);
    socket.on('call:accepted', onAccepted);
    socket.on('call:rejected', onRejected);
    socket.on('call:cancelled', onCancelled);
    socket.on('call:ended', onEnded);
    socket.on('call:peer_disconnected', onPeerDisconnected);
    socket.on('call:error', onError);

    return () => {
      socket.off('call:ringing', onRinging);
      socket.off('call:incoming', onIncoming);
      socket.off('call:accepted', onAccepted);
      socket.off('call:rejected', onRejected);
      socket.off('call:cancelled', onCancelled);
      socket.off('call:ended', onEnded);
      socket.off('call:peer_disconnected', onPeerDisconnected);
      socket.off('call:error', onError);
    };
  }, [socket, getRingtone, stopRingtone, clearCallTimeout, resetCallState, callState.receiver]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRingtone();
      clearCallTimeout();
    };
  }, [stopRingtone, clearCallTimeout]);

  const value = {
    callState,
    CALL_STATUS,
    isInCall: callState.status !== CALL_STATUS.IDLE,
    initiateCall,
    cancelCall,
    endCall,
    acceptCall,
    rejectCall,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
};

export const useCall = () => {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within a CallProvider');
  return ctx;
};
