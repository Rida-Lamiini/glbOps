import React, { useMemo, useRef, useState } from "react";
import { Send, Check, CheckCheck } from "lucide-react";

// Highlights "@Full Name" mentions in a rendered comment — a capitalized word optionally
// followed by another capitalized word, which covers every name in this app without needing
// the employee list at render time.
const MENTION_RE = /@\p{Lu}[\p{L}'-]*(?:\s\p{Lu}[\p{L}'-]*)?/gu;

function renderWithMentions(text) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<span className="gt-comment-mention" key={m.index}>{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/**
 * Free-form notes between people working a prestation — separate from the Historique tab,
 * which only ever logs automated pipeline events (stage changes, task completions).
 */
export default function CommentsPanel({ comments, onAdd, onMarkRead, currentUser, employees = [] }) {
  const [text, setText] = useState("");
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionAt, setMentionAt] = useState(-1);
  const textareaRef = useRef(null);
  const author = currentUser.name || currentUser.role;

  const mentionOptions = useMemo(() => {
    if (mentionQuery == null) return [];
    const q = mentionQuery.trim().toLowerCase();
    return employees.filter((e) => e.nom.toLowerCase().includes(q)).slice(0, 5);
  }, [mentionQuery, employees]);

  const detectMention = (value, caret) => {
    const uptoCaret = value.slice(0, caret);
    const at = uptoCaret.lastIndexOf("@");
    if (at === -1 || /[\n@]/.test(uptoCaret.slice(at + 1))) {
      setMentionQuery(null);
      setMentionAt(-1);
      return;
    }
    setMentionQuery(uptoCaret.slice(at + 1));
    setMentionAt(at);
  };

  const handleChange = (e) => {
    setText(e.target.value);
    detectMention(e.target.value, e.target.selectionStart);
  };

  const pickMention = (nom) => {
    const before = text.slice(0, mentionAt);
    const after = text.slice(mentionAt + 1 + mentionQuery.length);
    const next = `${before}@${nom} ${after}`;
    setText(next);
    setMentionQuery(null);
    setMentionAt(-1);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const submit = () => {
    const clean = text.trim();
    if (!clean) return;
    onAdd(clean);
    setText("");
    setMentionQuery(null);
  };

  return (
    <div className="gt-comments">
      <div className="gt-comments-list">
        {(comments || []).map((c, i) => {
          const isMine = c.author === author;
          const readers = (c.readers || []).filter((r) => r !== c.author);
          return (
            <div className="gt-comment" key={c.id ?? i}>
              <div className="gt-comment-head">
                <span className="gt-comment-author">{c.author || "—"}</span>
                {c.date && <span className="gt-comment-date">{c.date}</span>}
              </div>
              <div className="gt-comment-text">{renderWithMentions(c.text)}</div>
              <div className="gt-comment-foot">
                {isMine ? (
                  <span className="gt-comment-readers">
                    {readers.length > 0 ? (
                      <><CheckCheck size={12} /> Lu par {readers.join(", ")}</>
                    ) : (
                      <><Check size={12} /> Envoyé — pas encore lu</>
                    )}
                  </span>
                ) : c.isRead ? (
                  <span className="gt-comment-readers"><CheckCheck size={12} /> Marqué comme lu</span>
                ) : onMarkRead && c.id != null ? (
                  <button type="button" className="gt-comment-markread" onClick={() => onMarkRead(c.id)}>
                    Marquer comme lu
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
        {(comments || []).length === 0 && <div className="gt-list-empty">Aucun commentaire pour l'instant.</div>}
      </div>
      <div className="gt-comments-add">
        {mentionOptions.length > 0 && (
          <div className="gt-comments-mentions">
            {mentionOptions.map((e) => (
              <button type="button" key={e.id} onClick={() => pickMention(e.nom)}>
                @{e.nom} <span>{e.role}</span>
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          rows={2}
          value={text}
          onChange={handleChange}
          onClick={(e) => detectMention(e.target.value, e.target.selectionStart)}
          placeholder={`Écrire un commentaire (${author})… @ pour mentionner`}
          onKeyDown={(e) => {
            if (e.key === "Escape" && mentionQuery != null) {
              setMentionQuery(null);
              return;
            }
            if (e.key === "Enter" && !e.shiftKey && mentionOptions.length === 0) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button type="button" className="gt-btn gt-btn-primary" disabled={!text.trim()} onClick={submit}>
          <Send size={14} /> Envoyer
        </button>
      </div>
    </div>
  );
}
