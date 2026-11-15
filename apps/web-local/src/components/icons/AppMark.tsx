/**
 * The app mark, shared with the browser favicon so the window looks the same
 * everywhere. The path has to stay relative: the packaged desktop app loads the
 * page over `file://`, where a leading `/` means the filesystem root rather than
 * the renderer directory.
 */
export function AppMark({ className }: { className?: string }) {
  return (
    <img
      src="favicon.svg"
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`select-none ${className ?? ''}`}
    />
  );
}
