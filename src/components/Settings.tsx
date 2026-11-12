import { useStore } from '../store';
import { Dialog } from './shared';

export function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { muted, hints, toggleMuted, setHints } = useStore();
  return (
    <Dialog open={open} onClose={onClose} className="settings">
      <header className="settings-head">
        <h2>Settings</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>
      <label className="setting">
        <span>
          <b>Sound</b>
          <small>Clicks, stamps and chimes</small>
        </span>
        <input type="checkbox" className="toggle" checked={!muted} onChange={toggleMuted} />
      </label>
      <label className="setting pointer-only">
        <span>
          <b>Show names on hover</b>
          <small>Practice mode. Runs aren't ranked.</small>
        </span>
        <input type="checkbox" className="toggle" checked={hints} onChange={(e) => setHints(e.target.checked)} />
      </label>
      <div className="setting-keys pointer-only">
        <b>Keyboard</b>
        <dl>
          <div>
            <dt>
              <kbd>Space</kbd>
            </dt>
            <dd>Click whatever is under the cursor</dd>
          </div>
          <div>
            <dt>
              <kbd>S</kbd>
            </dt>
            <dd>Skip the current country</dd>
          </div>
          <div>
            <dt>
              <kbd>R</kbd>
            </dt>
            <dd>Restart the round</dd>
          </div>
          <div>
            <dt>
              <kbd>Pinch</kbd> <kbd>⌘ scroll</kbd>
            </dt>
            <dd>Zoom</dd>
          </div>
          <div>
            <dt>
              <kbd>↑</kbd> <kbd>↓</kbd> <kbd>Enter</kbd>
            </dt>
            <dd>Pick a region and start, on the menu</dd>
          </div>
        </dl>
      </div>
    </Dialog>
  );
}
