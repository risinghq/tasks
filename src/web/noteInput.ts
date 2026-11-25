/**
 * What a paste or a drop adds to a card's notes: each file, or else the text.
 * A copied image arrives as a file; a copied web page also carries its text,
 * which the image already shows, so files win.
 */
export function noteContent(data: DataTransfer | null): (string | File)[] {
  if (!data) return [];
  const files = [...data.files];
  if (files.length > 0) return files;
  const text = data.getData("text/plain").trim();
  return text ? [text] : [];
}

/** Whether a drag carries files, which is all a drop on a card accepts. */
export const carriesFiles = (data: DataTransfer | null): boolean => Boolean(data?.types.includes("Files"));

/** Whether a key or paste is meant for a text field rather than for the page. */
export function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}
