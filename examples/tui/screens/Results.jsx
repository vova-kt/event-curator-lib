import React, { useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';

const PAGE_SIZE = 10;

const Mode = Object.freeze({
  CURATED: 'curated',
  HISTORY: 'history',
});

export { Mode };

export default function ResultsScreen({
  events,
  cursor,
  setCursor,
  marks,
  setMarks,
  onSubmit,
  onBack,
  onOpenDetails,
  mode = Mode.CURATED,
  onPageVisible,
}) {
  const isHistory = mode === Mode.HISTORY;

  // Page-rendered "shown" trigger: every time the visible page changes (and on
  // first render), report the ids on that page so the consumer can persist
  // them. Idempotent at the storage layer; only fires when the page index or
  // the event-set identity actually change, ignoring callback reference churn.
  const pageStart = events.length === 0 ? 0 : Math.floor(cursor / PAGE_SIZE) * PAGE_SIZE;
  const pageEnd = Math.min(events.length, pageStart + PAGE_SIZE);
  const onPageVisibleRef = useRef(onPageVisible);
  onPageVisibleRef.current = onPageVisible;
  useEffect(() => {
    if (isHistory) return;
    if (!onPageVisibleRef.current) return;
    if (events.length === 0) return;
    const ids = events.slice(pageStart, pageEnd).map((e) => e.id).filter(Boolean);
    if (ids.length > 0) onPageVisibleRef.current(ids);
  }, [pageStart, events, isHistory]);

  useInput((input, key) => {
    if (events.length === 0) {
      if (key.return || input === 'q' || key.escape) onBack();
      return;
    }
    if (key.upArrow || input === 'k') {
      setCursor(Math.max(0, cursor - 1));
    } else if (key.downArrow || input === 'j') {
      setCursor(Math.min(events.length - 1, cursor + 1));
    } else if (key.pageUp || input === 'b') {
      setCursor(Math.max(0, cursor - PAGE_SIZE));
    } else if (key.pageDown || input === 'f' || input === ' ') {
      setCursor(Math.min(events.length - 1, cursor + PAGE_SIZE));
    } else if (input === 'g') {
      setCursor(0);
    } else if (input === 'G') {
      setCursor(events.length - 1);
    } else if (!isHistory && input === 'l') {
      const id = events[cursor].id;
      setMarks({ ...marks, [id]: marks[id] === 'like' ? undefined : 'like' });
    } else if (!isHistory && input === 'd') {
      const id = events[cursor].id;
      setMarks({ ...marks, [id]: marks[id] === 'dislike' ? undefined : 'dislike' });
    } else if (key.rightArrow || input === 'o') {
      onOpenDetails(cursor);
    } else if (key.return) {
      if (isHistory) { onBack(); return; }
      const liked = Object.entries(marks).filter(([, v]) => v === 'like').map(([id]) => id);
      const disliked = Object.entries(marks).filter(([, v]) => v === 'dislike').map(([id]) => id);
      onSubmit({ liked, disliked });
    } else if (key.escape || input === 'q') {
      if (isHistory) { onBack(); return; }
      onSubmit({ liked: [], disliked: [] });
    }
  });

  if (events.length === 0) {
    return (
      <Box flexDirection="column">
        <Text>{isHistory ? '(no history yet for this saved search)' : '(no events found)'}</Text>
        <Text dimColor>press enter to go back</Text>
      </Box>
    );
  }

  const visible = events.slice(pageStart, pageEnd);
  const pageNum = Math.floor(pageStart / PAGE_SIZE) + 1;
  const pageCount = Math.ceil(events.length / PAGE_SIZE);
  const titleLabel = isHistory ? 'history' : 'results';

  return (
    <Box flexDirection="column">
      <Text bold>
        {titleLabel} ({events.length}) <Text dimColor>· page {pageNum}/{pageCount} · showing {pageStart + 1}-{pageEnd}</Text>
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {visible.map((e, i) => {
          const idx = pageStart + i;
          const m = marks?.[e.id];
          const sym = m === 'like' ? '♥' : m === 'dislike' ? '✕' : ' ';
          const color = m === 'like' ? 'green' : m === 'dislike' ? 'red' : undefined;
          const date = (e.startsAt ?? '').slice(0, 16).replace('T', ' ');
          const venue = e.venue?.name ?? '';
          return (
            <Box key={e.id ?? idx} flexDirection="column">
              <Box>
                <Text color={idx === cursor ? 'cyan' : undefined}>{idx === cursor ? '› ' : '  '}</Text>
                <Text color={color}>{sym} </Text>
                <Text>{date}  </Text>
                <Text bold>{e.title}</Text>
                {venue && <Text dimColor>  — {venue}</Text>}
              </Box>
              {e.rationale && idx === cursor && (
                <Box marginLeft={6}>
                  <Text dimColor>↳ {e.rationale}</Text>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          {isHistory
            ? '↑/↓ move · pgup/pgdn page · g/G top/bot · →/o details · enter/esc/q back'
            : '↑/↓ move · pgup/pgdn page · g/G top/bot · →/o details · [l] like · [d] dislike · enter save · q/esc skip'}
        </Text>
      </Box>
    </Box>
  );
}
