import React, { useEffect, useRef, useState } from 'react';
import { useCall } from '../../context/CallContext';
import { useSocket } from '../../context/SocketContext';
import useWebRTC from '../../hooks/useWebRTC';

const ActiveCall = () => {
  const { callState, CALL_STATUS, endCall } = useCall();
  const { socket } = useSocket();

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [callDuration, setCallDuration] = useState(0);

  const isActive = callState.status === CALL_STATUS.ACTIVE;
  const isCaller = callState.caller === null; // If caller is null, WE initiated the call

  const targetUserId = isCaller
    ? (callState.receiver?.id || callState.receiver?._id)
    : (callState.caller?.id || callState.caller?._id);

  // Send ICE candidates via socket
  const handleSendIceCandidate = (candidate) => {
    if (socket && targetUserId) {
      socket.emit('webrtc:ice-candidate', {
        targetUserId,
        candidate,
      });
    }
  };

  const {
    localStream,
    remoteStream,
    isMicEnabled,
    isCameraEnabled,
    isScreenSharing,
    connectionQuality,
    createOffer,
    createAnswer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    endCall: cleanupWebRTC,
    toggleMicrophone,
    toggleCamera,
    toggleScreenShare,
  } = useWebRTC({
    onIceCandidate: handleSendIceCandidate,
  });

  // ─────────────────────────────────────────────────────
  // WebRTC Signaling Handlers over Socket.IO
  // ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isActive || !socket) return;

    const onWebRTCOffer = async ({ offer }) => {
      try {
        await handleOffer(offer);
        const answer = await createAnswer();
        socket.emit('webrtc:answer', { targetUserId, answer });
      } catch (err) {
        console.error('[ActiveCall] Error handling offer:', err);
      }
    };

    const onWebRTCAnswer = async ({ answer }) => {
      try {
        await handleAnswer(answer);
      } catch (err) {
        console.error('[ActiveCall] Error handling answer:', err);
      }
    };

    const onRemoteIceCandidate = async ({ candidate }) => {
      try {
        await handleIceCandidate(candidate);
      } catch (err) {
        console.error('[ActiveCall] Error handling ICE candidate:', err);
      }
    };

    socket.on('webrtc:offer', onWebRTCOffer);
    socket.on('webrtc:answer', onWebRTCAnswer);
    socket.on('webrtc:ice-candidate', onRemoteIceCandidate);

    // If we are the caller, initiate the WebRTC offer
    if (isCaller) {
      createOffer()
        .then((offer) => {
          socket.emit('webrtc:offer', { targetUserId, offer });
        })
        .catch((err) => console.error('[ActiveCall] Error creating offer:', err));
    }

    return () => {
      socket.off('webrtc:offer', onWebRTCOffer);
      socket.off('webrtc:answer', onWebRTCAnswer);
      socket.off('webrtc:ice-candidate', onRemoteIceCandidate);
    };
  }, [isActive, socket, isCaller, targetUserId, createOffer, createAnswer, handleOffer, handleAnswer, handleIceCandidate]);

  // Bind streams to video elements
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Call duration counter
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => {
      clearInterval(interval);
      setCallDuration(0);
    };
  }, [isActive]);

  // Cleanup WebRTC when call status is no longer active
  useEffect(() => {
    if (!isActive) {
      cleanupWebRTC();
    }
  }, [isActive, cleanupWebRTC]);

  if (!isActive) return null;

  const peerInfo = isCaller ? callState.receiver : callState.caller;

  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-between p-4 sm:p-6 select-none overflow-hidden">
      {/* Top Header Bar */}
      <div className="w-full max-w-6xl flex items-center justify-between z-10 bg-slate-900/60 backdrop-blur-md px-5 py-3 rounded-2xl border border-slate-800 shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-sm font-semibold text-white">
            {peerInfo?.name || 'Active Video Call'}
          </span>
          <span className="text-xs text-slate-400 font-mono">
            [{formatTime(callDuration)}]
          </span>
        </div>

        {/* Quality indicator */}
        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <span className="font-medium capitalize">{connectionQuality.level || 'Connecting...'}</span>
          <div className="flex space-x-0.5 items-end h-3">
            <div className={`w-1 rounded-full ${connectionQuality.level === 'poor' ? 'h-1 bg-rose-500' : 'h-1.5 bg-emerald-500'}`} />
            <div className={`w-1 rounded-full ${connectionQuality.level === 'fair' || connectionQuality.level === 'good' || connectionQuality.level === 'excellent' ? 'h-2 bg-emerald-500' : 'h-1 bg-slate-700'}`} />
            <div className={`w-1 rounded-full ${connectionQuality.level === 'good' || connectionQuality.level === 'excellent' ? 'h-3 bg-emerald-500' : 'h-1 bg-slate-700'}`} />
          </div>
        </div>
      </div>

      {/* Main Video Viewport */}
      <div className="relative w-full max-w-6xl flex-grow my-4 rounded-3xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center">
        {/* Remote Video Stream */}
        {remoteStream ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center space-y-4 text-center p-6">
            <div className="w-24 h-24 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center animate-pulse">
              <span className="text-4xl font-bold text-violet-400">
                {peerInfo?.name?.charAt(0).toUpperCase() || '?'}
              </span>
            </div>
            <p className="text-slate-300 font-medium text-sm">Connecting video stream to {peerInfo?.name || 'peer'}...</p>
          </div>
        )}

        {/* Local Video Picture-in-Picture (PiP) */}
        <div className="absolute bottom-4 right-4 w-36 h-48 sm:w-48 sm:h-64 bg-slate-900 rounded-2xl overflow-hidden border-2 border-slate-750 shadow-2xl z-20">
          {localStream && isCameraEnabled ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover -scale-x-100"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-500 text-xs">
              <svg className="w-8 h-8 mb-1 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span>Cam Off</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Control Bar */}
      <div className="z-10 bg-slate-900/80 backdrop-blur-md border border-slate-800 px-6 py-3.5 rounded-full flex items-center space-x-6 shadow-2xl">
        {/* Toggle Microphone */}
        <button
          onClick={toggleMicrophone}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
            isMicEnabled
              ? 'bg-slate-800 hover:bg-slate-700 text-white'
              : 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30'
          }`}
          title={isMicEnabled ? 'Mute Microphone' : 'Unmute Microphone'}
        >
          {isMicEnabled ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          )}
        </button>

        {/* Toggle Camera */}
        <button
          onClick={toggleCamera}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
            isCameraEnabled
              ? 'bg-slate-800 hover:bg-slate-700 text-white'
              : 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30'
          }`}
          title={isCameraEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
        >
          {isCameraEnabled ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          )}
        </button>

        {/* Toggle Screen Share */}
        <button
          onClick={toggleScreenShare}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
            isScreenSharing
              ? 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/30'
              : 'bg-slate-800 hover:bg-slate-700 text-white'
          }`}
          title={isScreenSharing ? 'Stop Screen Sharing' : 'Share Screen'}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </button>

        {/* End Call Button */}
        <button
          onClick={endCall}
          className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-600/40 active:scale-95 transition-all ring-4 ring-rose-600/20"
          title="End Call"
        >
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default ActiveCall;
