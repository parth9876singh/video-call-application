import Call from '../models/call.model.js';
import User from '../models/user.model.js';
import logger from '../utils/logger.js';

/** @type {Map<string, string>} userId -> callId */
const userActiveCall = new Map();

/** @type {Map<string, { callerId: string, receiverId: string, status: string }>} */
const activeCalls = new Map();

const MAX_SDP_LENGTH = 64 * 1024;
const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

const isObjectId = (value) => typeof value === 'string' && OBJECT_ID_RE.test(value);

const publicUser = (user) => ({
  _id: user._id.toString(),
  name: user.name,
  email: user.email,
  avatar: user.avatar,
  bio: user.bio,
});

const emitCallError = (socket, code, message, callId = null) => {
  socket.emit('call:error', { code, message, callId });
};

const emitToUser = (io, getUserActiveSockets, userId, event, payload) => {
  const socketIds = getUserActiveSockets(userId);
  socketIds.forEach((socketId) => {
    io.to(socketId).emit(event, payload);
  });
  return socketIds.length;
};

const clearCallMembership = (callId, callerId, receiverId) => {
  activeCalls.delete(callId);
  if (userActiveCall.get(callerId) === callId) userActiveCall.delete(callerId);
  if (userActiveCall.get(receiverId) === callId) userActiveCall.delete(receiverId);
};

const assertCallParticipant = (callMeta, userId) => {
  if (!callMeta) return { ok: false, code: 'CALL_NOT_FOUND', message: 'Call not found or no longer active.' };
  if (callMeta.callerId !== userId && callMeta.receiverId !== userId) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'You are not a participant in this call.' };
  }
  return { ok: true };
};

const getPeerId = (callMeta, userId) =>
  callMeta.callerId === userId ? callMeta.receiverId : callMeta.callerId;

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const validateSdpPayload = (sdpLike, label) => {
  if (!isPlainObject(sdpLike)) {
    return { ok: false, message: `Invalid ${label}: expected an object with type and sdp.` };
  }

  const keys = Object.keys(sdpLike);
  const allowed = new Set(['type', 'sdp']);
  if (keys.some((key) => !allowed.has(key))) {
    return { ok: false, message: `Invalid ${label}: only type and sdp fields are allowed.` };
  }

  if (sdpLike.type !== 'offer' && sdpLike.type !== 'answer') {
    return { ok: false, message: `Invalid ${label} type.` };
  }

  if (typeof sdpLike.sdp !== 'string' || sdpLike.sdp.length === 0) {
    return { ok: false, message: `Invalid ${label}: sdp must be a non-empty string.` };
  }

  if (sdpLike.sdp.length > MAX_SDP_LENGTH) {
    return { ok: false, message: `Invalid ${label}: sdp exceeds size limit.` };
  }

  // Hard guard: Socket.IO must never carry media frames
  if (sdpLike.audio || sdpLike.video || sdpLike.stream || sdpLike.tracks || sdpLike.data) {
    return { ok: false, message: `Invalid ${label}: media payloads are not allowed over signaling.` };
  }

  return { ok: true, value: { type: sdpLike.type, sdp: sdpLike.sdp } };
};

const validateIceCandidate = (candidate) => {
  if (!isPlainObject(candidate)) {
    return { ok: false, message: 'Invalid ICE candidate payload.' };
  }

  // Reject obvious media / binary smuggling
  if (candidate.audio || candidate.video || candidate.stream || candidate.buffer) {
    return { ok: false, message: 'Media payloads are not allowed in ICE signaling.' };
  }

  if (candidate.candidate != null && typeof candidate.candidate !== 'string') {
    return { ok: false, message: 'Invalid ICE candidate.candidate field.' };
  }

  if (candidate.sdpMid != null && typeof candidate.sdpMid !== 'string') {
    return { ok: false, message: 'Invalid ICE candidate.sdpMid field.' };
  }

  if (
    candidate.sdpMLineIndex != null &&
    (typeof candidate.sdpMLineIndex !== 'number' || !Number.isFinite(candidate.sdpMLineIndex))
  ) {
    return { ok: false, message: 'Invalid ICE candidate.sdpMLineIndex field.' };
  }

  return {
    ok: true,
    value: {
      candidate: candidate.candidate ?? null,
      sdpMid: candidate.sdpMid ?? null,
      sdpMLineIndex: candidate.sdpMLineIndex ?? null,
      usernameFragment: typeof candidate.usernameFragment === 'string'
        ? candidate.usernameFragment
        : undefined,
    },
  };
};

const finalizeCallInDb = async (callId, status, extra = {}) => {
  const call = await Call.findById(callId);
  if (!call) return null;

  // Do not overwrite terminal states
  if (['ended', 'rejected', 'missed', 'failed'].includes(call.status)) {
    return call;
  }

  call.status = status;
  call.endedAt = extra.endedAt || new Date();

  if (status === 'ended' && call.startedAt) {
    call.duration = Math.max(
      0,
      Math.floor((call.endedAt.getTime() - new Date(call.startedAt).getTime()) / 1000)
    );
  }

  if (extra.startedAt) {
    call.startedAt = extra.startedAt;
  }

  await call.save();
  return call;
};

/**
 * Register WebRTC signaling handlers for an authenticated socket.
 * Socket.IO carries ONLY signaling (SDP / ICE / call control) — never media.
 */
export const registerCallHandlers = (socket, io, { getUserActiveSockets }) => {
  const userId = socket.user._id.toString();

  const reply = (ack, payload) => {
    if (typeof ack === 'function') ack(payload);
  };

  socket.on('call:initiate', async (payload = {}, ack) => {
    try {
      if (!isPlainObject(payload)) {
        emitCallError(socket, 'INVALID_EVENT', 'Invalid call:initiate payload.');
        return reply(ack, { success: false, code: 'INVALID_EVENT' });
      }

      const receiverId = payload.receiverId;

      if (!isObjectId(receiverId)) {
        emitCallError(socket, 'INVALID_RECEIVER', 'Valid receiverId is required.');
        return reply(ack, { success: false, code: 'INVALID_RECEIVER' });
      }

      if (receiverId === userId) {
        emitCallError(socket, 'SELF_CALL', 'You cannot call yourself.');
        return reply(ack, { success: false, code: 'SELF_CALL' });
      }

      // Never trust client-supplied caller identity
      if (payload.callerId && payload.callerId !== userId) {
        emitCallError(socket, 'UNAUTHORIZED', 'Caller identity mismatch.');
        return reply(ack, { success: false, code: 'UNAUTHORIZED' });
      }

      if (userActiveCall.has(userId)) {
        emitCallError(socket, 'CALLER_BUSY', 'You are already in a call.');
        return reply(ack, { success: false, code: 'CALLER_BUSY' });
      }

      if (userActiveCall.has(receiverId)) {
        emitCallError(socket, 'RECEIVER_BUSY', 'The receiver is already in a call.');
        return reply(ack, { success: false, code: 'RECEIVER_BUSY' });
      }

      const receiverSockets = getUserActiveSockets(receiverId);
      if (receiverSockets.length === 0) {
        emitCallError(socket, 'RECEIVER_OFFLINE', 'The receiver is offline.');
        return reply(ack, { success: false, code: 'RECEIVER_OFFLINE' });
      }

      const receiver = await User.findById(receiverId).select('-passwordHash');
      if (!receiver) {
        emitCallError(socket, 'RECEIVER_NOT_FOUND', 'Receiver user not found.');
        return reply(ack, { success: false, code: 'RECEIVER_NOT_FOUND' });
      }

      const call = await Call.create({
        caller: userId,
        receiver: receiverId,
        status: 'ringing',
      });

      const callId = call._id.toString();
      activeCalls.set(callId, {
        callerId: userId,
        receiverId,
        status: 'ringing',
      });
      userActiveCall.set(userId, callId);
      userActiveCall.set(receiverId, callId);

      const ringingPayload = {
        callId,
        status: 'ringing',
        caller: publicUser(socket.user),
        receiver: publicUser(receiver),
      };

      // Notify receiver (incoming) and caller (outgoing confirmation)
      emitToUser(io, getUserActiveSockets, receiverId, 'call:ringing', ringingPayload);
      socket.emit('call:ringing', ringingPayload);

      logger.info(`Call initiated ${callId}: ${userId} -> ${receiverId}`);
      return reply(ack, { success: true, callId, status: 'ringing' });
    } catch (err) {
      logger.error('call:initiate error:', err);
      emitCallError(socket, 'SERVER_ERROR', 'Failed to initiate call.');
      return reply(ack, { success: false, code: 'SERVER_ERROR' });
    }
  });

  socket.on('call:accept', async (payload = {}, ack) => {
    try {
      if (!isPlainObject(payload) || !isObjectId(payload.callId)) {
        emitCallError(socket, 'INVALID_CALL_ID', 'Valid callId is required.');
        return reply(ack, { success: false, code: 'INVALID_CALL_ID' });
      }

      const callId = payload.callId;
      const callMeta = activeCalls.get(callId);
      const auth = assertCallParticipant(callMeta, userId);
      if (!auth.ok) {
        emitCallError(socket, auth.code, auth.message, callId);
        return reply(ack, { success: false, code: auth.code });
      }

      if (callMeta.receiverId !== userId) {
        emitCallError(socket, 'UNAUTHORIZED', 'Only the receiver can accept this call.', callId);
        return reply(ack, { success: false, code: 'UNAUTHORIZED' });
      }

      if (callMeta.status !== 'ringing') {
        emitCallError(socket, 'INVALID_STATE', 'Call is not in ringing state.', callId);
        return reply(ack, { success: false, code: 'INVALID_STATE' });
      }

      const startedAt = new Date();
      callMeta.status = 'accepted';
      activeCalls.set(callId, callMeta);

      await Call.findByIdAndUpdate(callId, {
        status: 'accepted',
        startedAt,
      });

      const acceptPayload = {
        callId,
        status: 'accepted',
        acceptedBy: userId,
        startedAt: startedAt.toISOString(),
      };

      emitToUser(io, getUserActiveSockets, callMeta.callerId, 'call:accept', acceptPayload);
      socket.emit('call:accept', acceptPayload);

      logger.info(`Call accepted ${callId} by ${userId}`);
      return reply(ack, { success: true, callId, status: 'accepted' });
    } catch (err) {
      logger.error('call:accept error:', err);
      emitCallError(socket, 'SERVER_ERROR', 'Failed to accept call.');
      return reply(ack, { success: false, code: 'SERVER_ERROR' });
    }
  });

  socket.on('call:reject', async (payload = {}, ack) => {
    try {
      if (!isPlainObject(payload) || !isObjectId(payload.callId)) {
        emitCallError(socket, 'INVALID_CALL_ID', 'Valid callId is required.');
        return reply(ack, { success: false, code: 'INVALID_CALL_ID' });
      }

      const callId = payload.callId;
      const callMeta = activeCalls.get(callId);
      const auth = assertCallParticipant(callMeta, userId);
      if (!auth.ok) {
        emitCallError(socket, auth.code, auth.message, callId);
        return reply(ack, { success: false, code: auth.code });
      }

      if (callMeta.receiverId !== userId) {
        emitCallError(socket, 'UNAUTHORIZED', 'Only the receiver can reject this call.', callId);
        return reply(ack, { success: false, code: 'UNAUTHORIZED' });
      }

      if (callMeta.status !== 'ringing') {
        emitCallError(socket, 'INVALID_STATE', 'Call is not in ringing state.', callId);
        return reply(ack, { success: false, code: 'INVALID_STATE' });
      }

      await finalizeCallInDb(callId, 'rejected');
      clearCallMembership(callId, callMeta.callerId, callMeta.receiverId);

      const rejectPayload = {
        callId,
        status: 'rejected',
        rejectedBy: userId,
      };

      emitToUser(io, getUserActiveSockets, callMeta.callerId, 'call:reject', rejectPayload);
      socket.emit('call:reject', rejectPayload);

      logger.info(`Call rejected ${callId} by ${userId}`);
      return reply(ack, { success: true, callId, status: 'rejected' });
    } catch (err) {
      logger.error('call:reject error:', err);
      emitCallError(socket, 'SERVER_ERROR', 'Failed to reject call.');
      return reply(ack, { success: false, code: 'SERVER_ERROR' });
    }
  });

  socket.on('call:offer', async (payload = {}, ack) => {
    try {
      if (!isPlainObject(payload) || !isObjectId(payload.callId)) {
        emitCallError(socket, 'INVALID_EVENT', 'call:offer requires callId and offer.');
        return reply(ack, { success: false, code: 'INVALID_EVENT' });
      }

      const callId = payload.callId;
      const callMeta = activeCalls.get(callId);
      const auth = assertCallParticipant(callMeta, userId);
      if (!auth.ok) {
        emitCallError(socket, auth.code, auth.message, callId);
        return reply(ack, { success: false, code: auth.code });
      }

      if (callMeta.callerId !== userId) {
        emitCallError(socket, 'UNAUTHORIZED', 'Only the caller can send the offer.', callId);
        return reply(ack, { success: false, code: 'UNAUTHORIZED' });
      }

      if (callMeta.status !== 'accepted' && callMeta.status !== 'negotiating') {
        emitCallError(socket, 'INVALID_STATE', 'Offer can only be sent after the call is accepted.', callId);
        return reply(ack, { success: false, code: 'INVALID_STATE' });
      }

      const sdpCheck = validateSdpPayload(payload.offer, 'offer');
      if (!sdpCheck.ok) {
        emitCallError(socket, 'INVALID_SDP', sdpCheck.message, callId);
        return reply(ack, { success: false, code: 'INVALID_SDP' });
      }

      if (sdpCheck.value.type !== 'offer') {
        emitCallError(socket, 'INVALID_SDP', 'SDP type must be offer.', callId);
        return reply(ack, { success: false, code: 'INVALID_SDP' });
      }

      callMeta.status = 'negotiating';
      activeCalls.set(callId, callMeta);

      emitToUser(io, getUserActiveSockets, callMeta.receiverId, 'call:offer', {
        callId,
        offer: sdpCheck.value,
        from: userId,
      });

      return reply(ack, { success: true, callId });
    } catch (err) {
      logger.error('call:offer error:', err);
      emitCallError(socket, 'SERVER_ERROR', 'Failed to relay offer.');
      return reply(ack, { success: false, code: 'SERVER_ERROR' });
    }
  });

  socket.on('call:answer', async (payload = {}, ack) => {
    try {
      if (!isPlainObject(payload) || !isObjectId(payload.callId)) {
        emitCallError(socket, 'INVALID_EVENT', 'call:answer requires callId and answer.');
        return reply(ack, { success: false, code: 'INVALID_EVENT' });
      }

      const callId = payload.callId;
      const callMeta = activeCalls.get(callId);
      const auth = assertCallParticipant(callMeta, userId);
      if (!auth.ok) {
        emitCallError(socket, auth.code, auth.message, callId);
        return reply(ack, { success: false, code: auth.code });
      }

      if (callMeta.receiverId !== userId) {
        emitCallError(socket, 'UNAUTHORIZED', 'Only the receiver can send the answer.', callId);
        return reply(ack, { success: false, code: 'UNAUTHORIZED' });
      }

      if (callMeta.status !== 'accepted' && callMeta.status !== 'negotiating') {
        emitCallError(socket, 'INVALID_STATE', 'Answer can only be sent for an accepted call.', callId);
        return reply(ack, { success: false, code: 'INVALID_STATE' });
      }

      const sdpCheck = validateSdpPayload(payload.answer, 'answer');
      if (!sdpCheck.ok) {
        emitCallError(socket, 'INVALID_SDP', sdpCheck.message, callId);
        return reply(ack, { success: false, code: 'INVALID_SDP' });
      }

      if (sdpCheck.value.type !== 'answer') {
        emitCallError(socket, 'INVALID_SDP', 'SDP type must be answer.', callId);
        return reply(ack, { success: false, code: 'INVALID_SDP' });
      }

      callMeta.status = 'negotiating';
      activeCalls.set(callId, callMeta);

      emitToUser(io, getUserActiveSockets, callMeta.callerId, 'call:answer', {
        callId,
        answer: sdpCheck.value,
        from: userId,
      });

      return reply(ack, { success: true, callId });
    } catch (err) {
      logger.error('call:answer error:', err);
      emitCallError(socket, 'SERVER_ERROR', 'Failed to relay answer.');
      return reply(ack, { success: false, code: 'SERVER_ERROR' });
    }
  });

  socket.on('call:ice-candidate', async (payload = {}, ack) => {
    try {
      if (!isPlainObject(payload) || !isObjectId(payload.callId)) {
        emitCallError(socket, 'INVALID_EVENT', 'call:ice-candidate requires callId and candidate.');
        return reply(ack, { success: false, code: 'INVALID_EVENT' });
      }

      const callId = payload.callId;
      const callMeta = activeCalls.get(callId);
      const auth = assertCallParticipant(callMeta, userId);
      if (!auth.ok) {
        emitCallError(socket, auth.code, auth.message, callId);
        return reply(ack, { success: false, code: auth.code });
      }

      if (!['accepted', 'negotiating'].includes(callMeta.status)) {
        emitCallError(socket, 'INVALID_STATE', 'ICE candidates are only allowed during an active negotiation.', callId);
        return reply(ack, { success: false, code: 'INVALID_STATE' });
      }

      const iceCheck = validateIceCandidate(payload.candidate);
      if (!iceCheck.ok) {
        emitCallError(socket, 'INVALID_ICE', iceCheck.message, callId);
        return reply(ack, { success: false, code: 'INVALID_ICE' });
      }

      const peerId = getPeerId(callMeta, userId);
      emitToUser(io, getUserActiveSockets, peerId, 'call:ice-candidate', {
        callId,
        candidate: iceCheck.value,
        from: userId,
      });

      return reply(ack, { success: true, callId });
    } catch (err) {
      logger.error('call:ice-candidate error:', err);
      emitCallError(socket, 'SERVER_ERROR', 'Failed to relay ICE candidate.');
      return reply(ack, { success: false, code: 'SERVER_ERROR' });
    }
  });

  socket.on('call:end', async (payload = {}, ack) => {
    try {
      if (!isPlainObject(payload) || !isObjectId(payload.callId)) {
        emitCallError(socket, 'INVALID_CALL_ID', 'Valid callId is required.');
        return reply(ack, { success: false, code: 'INVALID_CALL_ID' });
      }

      const callId = payload.callId;
      const callMeta = activeCalls.get(callId);
      const auth = assertCallParticipant(callMeta, userId);
      if (!auth.ok) {
        emitCallError(socket, auth.code, auth.message, callId);
        return reply(ack, { success: false, code: auth.code });
      }

      const terminalStatus = callMeta.status === 'ringing' ? 'missed' : 'ended';
      await finalizeCallInDb(callId, terminalStatus);
      clearCallMembership(callId, callMeta.callerId, callMeta.receiverId);

      const endPayload = {
        callId,
        status: terminalStatus,
        endedBy: userId,
      };

      const peerId = getPeerId(callMeta, userId);
      emitToUser(io, getUserActiveSockets, peerId, 'call:end', endPayload);
      socket.emit('call:end', endPayload);

      logger.info(`Call ended ${callId} by ${userId} (${terminalStatus})`);
      return reply(ack, { success: true, callId, status: terminalStatus });
    } catch (err) {
      logger.error('call:end error:', err);
      emitCallError(socket, 'SERVER_ERROR', 'Failed to end call.');
      return reply(ack, { success: false, code: 'SERVER_ERROR' });
    }
  });

  // Reject unknown call:* style probing isn't possible globally, but guard empty payloads above.
  // On disconnect: end any active call involving this user.
  socket.on('disconnect', async () => {
    const callId = userActiveCall.get(userId);
    if (!callId) return;

    const callMeta = activeCalls.get(callId);
    if (!callMeta) {
      userActiveCall.delete(userId);
      return;
    }

    // Only end if this user has no remaining sockets (checked by caller after delete)
    // The socket.service disconnect handler removes this socket first; we schedule a microtask
    // so getUserActiveSockets reflects remaining tabs.
    setImmediate(async () => {
      try {
        const stillConnected = getUserActiveSockets(userId).length > 0;
        if (stillConnected) return;

        const latest = activeCalls.get(callId);
        if (!latest) return;
        if (latest.callerId !== userId && latest.receiverId !== userId) return;

        const terminalStatus = latest.status === 'ringing' ? 'missed' : 'ended';
        await finalizeCallInDb(callId, terminalStatus);
        clearCallMembership(callId, latest.callerId, latest.receiverId);

        const peerId = getPeerId(latest, userId);
        emitToUser(io, getUserActiveSockets, peerId, 'call:end', {
          callId,
          status: terminalStatus,
          endedBy: userId,
          reason: 'peer_disconnected',
        });

        logger.info(`Call ${callId} ended due to disconnect of ${userId}`);
      } catch (err) {
        logger.error('Error ending call on disconnect:', err);
      }
    });
  });
};

export const getActiveCallForUser = (userId) => userActiveCall.get(userId?.toString()) || null;

export const isUserInCall = (userId) => userActiveCall.has(userId?.toString());
