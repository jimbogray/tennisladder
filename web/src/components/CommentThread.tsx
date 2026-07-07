import type { MatchEventDto } from "@tennisladder/shared";

export function CommentThread({ events }: { events: MatchEventDto[] }) {
  return (
    <ul>
      {events.map((event) => (
        <li key={event.id}>
          <strong>{event.type.replace(/_/g, " ")}</strong> — {new Date(event.createdAt).toLocaleString()}
          {event.comment ? <p>{event.comment}</p> : null}
        </li>
      ))}
    </ul>
  );
}
