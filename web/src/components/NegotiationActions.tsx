export function NegotiationActions({
  onAccept,
  onDecline,
  onCounter,
}: {
  onAccept: () => void;
  onDecline: () => void;
  onCounter: () => void;
}) {
  return (
    <div>
      <button type="button" onClick={onAccept}>
        Accept
      </button>
      <button type="button" onClick={onCounter}>
        Counter
      </button>
      <button type="button" onClick={onDecline}>
        Decline
      </button>
    </div>
  );
}
