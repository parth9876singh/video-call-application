/**
 * CallOverlay — mounts IncomingCall, OutgoingCall, and ActiveCall overlays at app root.
 * Rendered outside of route trees so calls persist across navigation.
 */
import React from 'react';
import IncomingCall from './IncomingCall';
import OutgoingCall from './OutgoingCall';
import ActiveCall from './ActiveCall';

const CallOverlay = () => (
  <>
    <IncomingCall />
    <OutgoingCall />
    <ActiveCall />
  </>
);

export default CallOverlay;
