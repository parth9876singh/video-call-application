import Call from '../models/call.model.js';
import logger from '../utils/logger.js';

// In-memory map to track active calls to prevent duplicate calls
// Key: userId -> Value: { callId, role: 'caller' | 'receiver' }
const activeCalls = new Map();

/**
 * Registers all call signaling Socket.IO event handlers.
 * Only handles control plane (offer/answer/ICE/call management).
 * Audio/video media NEVER passes through here — it's strictly P2P via WebRTC.
 *
 * @param {Socket} socket - The authenticated socket instance
 * @param {Server} io - The Socket.IO server
 * @param {{ getUserActiveSockets: Function }} helpers
 */
export const registerCallHandlers = (socket, io, { getUserActiveSockets }) => {
  const callerId = socket.user._id.toString();
  const callerName = socket.user.name;

  // ─────────────────────────────────────────────────────
  // call:initiate — Caller wants to ring another user
  // ─────────────────────────────────────────────────────
  socket.on('call:initiate', async (data = {}) => {
    let rawId = data.targetUserId || data.receiverId || data.target;
    if (rawId && typeof rawId === 'object' && rawId.toString) {
      rawId = rawId.toString();
    }
    const targetUserId = rawId ? String(rawId).trim() : '';
    const callType = data.callType || 'video';

    if (!targetUserId) {
      socket.emit('call:error', { message: 'Valid receiverId is required.' });
      return;
    }

    if (callerId === targetUserId) {
      socket.emit('call:error', { message: 'You cannot call yourself.' });
      return;
    }

    logger.info(`call:initiate — ${callerName} → ${targetUserId} [${callType}]`);

    // Prevent caller from making a call while already in one
    if (activeCalls.has(callerId)) {
      socket.emit('call:error', { message: 'You are already in an active call.' });
      return;
    }

    // Prevent ringing a user who is already in a call
    if (activeCalls.has(targetUserId)) {
      socket.emit('call:error', { message: 'That user is already in a call.' });
      return;
    }

    // Check target user has active sockets (is online)
    const targetSocketIds = getUserActiveSockets(targetUserId);
    if (targetSocketIds.length === 0) {
      socket.emit('call:error', { message: 'User is offline.' });
      return;
    }

    // Create a pending call record in MongoDB
    let callRecord;
    try {
      callRecord = await Call.create({
        caller: callerId,
        receiver: targetUserId,
        status: 'ringing',
      });
    } catch (err) {
      logger.error('Failed to create call record:', err);
      socket.emit('call:error', { message: 'Failed to initiate call. Please try again.' });
      return;
    }

    const callId = callRecord._id.toString();

    // Mark both users as in an active call
    activeCalls.set(callerId, { callId, role: 'caller', targetUserId });
    activeCalls.set(targetUserId, { callId, role: 'receiver', targetUserId: callerId });

    // Route call:incoming to ALL sockets of the target user (handles multiple tabs)
    targetSocketIds.forEach((socketId) => {
      io.to(socketId).emit('call:incoming', {
        callId,
        callType,
        caller: {
          id: callerId,
          name: callerName,
          avatar: socket.user.avatar,
          email: socket.user.email,
        },
      });
    });

    // Acknowledge the caller that ringing has started
    socket.emit('call:ringing', { callId, targetUserId });
    logger.info(`call:ringing — callId: ${callId}`);
  });

  // ─────────────────────────────────────────────────────
  // call:accept — Receiver accepts the call
  // ─────────────────────────────────────────────────────
  socket.on('call:accept', async ({ callId }) => {
    logger.info(`call:accept — callId: ${callId} by ${callerName}`);

    const callData = activeCalls.get(callerId);
    if (!callData || callData.callId !== callId) {
      socket.emit('call:error', { message: 'No matching incoming call found.' });
      return;
    }

    const callerSocketIds = getUserActiveSockets(callData.targetUserId);

    // Update call record
    await Call.findByIdAndUpdate(callId, {
      status: 'accepted',
      startedAt: new Date(),
    }).catch((err) => logger.error('Failed to update call record on accept:', err));

    // Notify caller that the receiver accepted
    callerSocketIds.forEach((socketId) => {
      io.to(socketId).emit('call:accepted', {
        callId,
        receiver: {
          id: callerId,
          name: callerName,
          avatar: socket.user.avatar,
        },
      });
    });

    logger.info(`call:accepted — callId: ${callId}`);
  });

  // ─────────────────────────────────────────────────────
  // call:reject — Receiver declines the call
  // ─────────────────────────────────────────────────────
  socket.on('call:reject', async ({ callId }) => {
    logger.info(`call:reject — callId: ${callId} by ${callerName}`);

    const callData = activeCalls.get(callerId);
    if (!callData || callData.callId !== callId) return;

    const callerSocketIds = getUserActiveSockets(callData.targetUserId);

    // Clean up active call entries for both parties
    activeCalls.delete(callerId);
    activeCalls.delete(callData.targetUserId);

    // Update call record
    await Call.findByIdAndUpdate(callId, { status: 'rejected' })
      .catch((err) => logger.error('Failed to update call record on reject:', err));

    // Notify caller
    callerSocketIds.forEach((socketId) => {
      io.to(socketId).emit('call:rejected', { callId });
    });

    logger.info(`call:rejected — callId: ${callId}`);
  });

  // ─────────────────────────────────────────────────────
  // call:cancel — Caller cancels before receiver answers
  // ─────────────────────────────────────────────────────
  socket.on('call:cancel', async ({ callId }) => {
    logger.info(`call:cancel — callId: ${callId} by ${callerName}`);

    const callData = activeCalls.get(callerId);
    if (!callData || callData.callId !== callId) return;

    const receiverSocketIds = getUserActiveSockets(callData.targetUserId);

    // Clean up
    activeCalls.delete(callerId);
    activeCalls.delete(callData.targetUserId);

    await Call.findByIdAndUpdate(callId, { status: 'missed' })
      .catch((err) => logger.error('Failed to update call record on cancel:', err));

    // Notify receiver that the call was cancelled
    receiverSocketIds.forEach((socketId) => {
      io.to(socketId).emit('call:cancelled', { callId });
    });

    logger.info(`call:cancelled — callId: ${callId}`);
  });

  // ─────────────────────────────────────────────────────
  // call:end — Either party ends an active call
  // ─────────────────────────────────────────────────────
  socket.on('call:end', async ({ callId }) => {
    logger.info(`call:end — callId: ${callId} by ${callerName}`);

    const callData = activeCalls.get(callerId);
    if (!callData || callData.callId !== callId) return;

    const otherPartySocketIds = getUserActiveSockets(callData.targetUserId);

    // Calculate duration
    const callRecord = await Call.findById(callId).catch(() => null);
    const endedAt = new Date();
    const duration = callRecord?.startedAt
      ? Math.floor((endedAt - callRecord.startedAt) / 1000)
      : 0;

    // Clean up
    activeCalls.delete(callerId);
    activeCalls.delete(callData.targetUserId);

    await Call.findByIdAndUpdate(callId, {
      status: 'ended',
      endedAt,
      duration,
    }).catch((err) => logger.error('Failed to update call record on end:', err));

    // Notify other party
    otherPartySocketIds.forEach((socketId) => {
      io.to(socketId).emit('call:ended', { callId });
    });

    logger.info(`call:ended — callId: ${callId}, duration: ${duration}s`);
  });

  // ─────────────────────────────────────────────────────
  // call:timeout — Receiver did not respond (sent by caller-side timer)
  // ─────────────────────────────────────────────────────
  socket.on('call:timeout', async ({ callId }) => {
    logger.info(`call:timeout — callId: ${callId}`);

    const callData = activeCalls.get(callerId);
    if (!callData || callData.callId !== callId) return;

    const receiverSocketIds = getUserActiveSockets(callData.targetUserId);

    activeCalls.delete(callerId);
    activeCalls.delete(callData.targetUserId);

    await Call.findByIdAndUpdate(callId, { status: 'missed' })
      .catch((err) => logger.error('Failed to update call on timeout:', err));

    receiverSocketIds.forEach((socketId) => {
      io.to(socketId).emit('call:cancelled', { callId });
    });

    socket.emit('call:timeout_confirmed', { callId });
    logger.info(`call:timeout resolved — callId: ${callId}`);
  });

  // ─────────────────────────────────────────────────────
  // WebRTC Peer-to-Peer Signaling Relay Handlers
  // (Control plane SDP / ICE candidate relay only — media streams never touch the server)
  // ─────────────────────────────────────────────────────
  socket.on('webrtc:offer', ({ targetUserId, offer }) => {
    if (!targetUserId || !offer) return;
    const targetSocketIds = getUserActiveSockets(targetUserId);
    targetSocketIds.forEach((socketId) => {
      io.to(socketId).emit('webrtc:offer', {
        callerId,
        offer,
      });
    });
  });

  socket.on('webrtc:answer', ({ targetUserId, answer }) => {
    if (!targetUserId || !answer) return;
    const targetSocketIds = getUserActiveSockets(targetUserId);
    targetSocketIds.forEach((socketId) => {
      io.to(socketId).emit('webrtc:answer', {
        receiverId: callerId,
        answer,
      });
    });
  });

  socket.on('webrtc:ice-candidate', ({ targetUserId, candidate }) => {
    if (!targetUserId || !candidate) return;
    const targetSocketIds = getUserActiveSockets(targetUserId);
    targetSocketIds.forEach((socketId) => {
      io.to(socketId).emit('webrtc:ice-candidate', {
        fromUserId: callerId,
        candidate,
      });
    });
  });

  // ─────────────────────────────────────────────────────
  // Cleanup active calls on unexpected disconnect
  // ─────────────────────────────────────────────────────
  socket.on('disconnect', async () => {
    const callData = activeCalls.get(callerId);
    if (!callData) return;

    const { callId, targetUserId } = callData;
    const otherPartySocketIds = getUserActiveSockets(targetUserId);

    activeCalls.delete(callerId);
    activeCalls.delete(targetUserId);

    const callRecord = await Call.findById(callId).catch(() => null);
    if (callRecord && !['ended', 'rejected', 'missed'].includes(callRecord.status)) {
      const endedAt = new Date();
      const duration = callRecord.startedAt
        ? Math.floor((endedAt - callRecord.startedAt) / 1000)
        : 0;
      await Call.findByIdAndUpdate(callId, {
        status: callRecord.status === 'ringing' ? 'missed' : 'ended',
        endedAt,
        duration,
      }).catch(() => {});
    }

    // Tell the other party the call ended due to disconnect
    otherPartySocketIds.forEach((socketId) => {
      io.to(socketId).emit('call:peer_disconnected', { callId });
    });

    logger.info(`call cleanup on disconnect — callId: ${callId}, caller: ${callerName}`);
  });
};

// Exported helper for external use (e.g. REST API)
export const getActiveCalls = () => activeCalls;
