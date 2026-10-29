import { useEffect, useState } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, CircleDot } from "lucide-react";
import { EASE } from "./Micro";
import { useApi, errMsg } from "../lib/api";
import { fmtTs } from "../lib/format";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Label } from "./ui/label";

export const ReviewPanel = ({ eventId, initial, ended, evidenceVersion }) => {
  const api = useApi();
  const [note, setNote] = useState(initial.note || "");
  const [status, setStatus] = useState(initial.status || "unreviewed");
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(0);
  useEffect(() => { setNote(initial.note || ""); setStatus(initial.status || "unreviewed"); setSaved(initial); }, [initial]);
  const dirty = note !== (saved.note || "") || status !== (saved.status || "unreviewed");

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.put(`/events/${eventId}/review`, { note, status });
      setSaved(data);
      setJustSaved((n) => n + 1);
      toast.success("Review saved");
    } catch (e) {
      toast.error(`Could not save review: ${errMsg(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel p-5 sm:p-6 space-y-5" data-testid="review-panel">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Human review</h2>
        <AnimatePresence mode="wait" initial={false}>
        {dirty ? (
          <motion.span key="dirty" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15, ease: EASE }}
            className="pill tag-change" role="status" data-testid="review-dirty-indicator"><CircleDot className="h-3.5 w-3.5" aria-hidden />Unsaved changes</motion.span>
        ) : saved.updated_at ? (
          <motion.span key={`saved-${justSaved}`} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18, ease: EASE }}
            className="pill tag-ok" role="status" data-testid="review-saved-indicator">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <motion.path d="M5 8.2l2 2 4-4.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                initial={{ pathLength: justSaved ? 0 : 1 }} animate={{ pathLength: 1 }} transition={{ duration: 0.22, delay: 0.06, ease: EASE }} /></svg>
            {justSaved ? "Saved just now" : "Saved"}</motion.span>
        ) : null}
        </AnimatePresence>
      </div>
      <div className="text-xs text-muted-foreground">Change status: <span className="font-medium text-foreground" data-testid="review-change-ended">{ended ? "Ended" : "Not ended at end of data"}</span>. Review status is recorded separately.</div>
      <RadioGroup value={status} onValueChange={setStatus} className="gap-2" aria-label="Review status">
        <div className="flex items-center gap-2"><RadioGroupItem value="unreviewed" id="st-un" data-testid="review-status-unreviewed" /><Label htmlFor="st-un">Not reviewed</Label></div>
        <div className="flex items-center gap-2"><RadioGroupItem value="reviewed" id="st-rv" data-testid="review-status-reviewed" /><Label htmlFor="st-rv">Reviewed</Label></div>
      </RadioGroup>
      <div className="space-y-1.5">
        <Label htmlFor="review-note">Reviewer note</Label>
        <Textarea id="review-note" rows={6} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observations, follow-up context…" className="bg-card" data-testid="review-note-input" />
      </div>
      <Button className="w-full" onClick={save} disabled={busy || (!dirty && !!saved.updated_at)} aria-busy={busy} data-testid="review-save-button">{busy ? "Saving…" : dirty || !saved.updated_at ? "Save review" : <><CheckCircle2 className="h-4 w-4" aria-hidden />Saved</>}</Button>
      {saved.evidence_version_at_review && saved.evidence_version_at_review !== evidenceVersion && (
        <div className="text-xs tag-change rounded p-2" data-testid="review-outdated-evidence">This review was saved on evidence v{saved.evidence_version_at_review}; the evidence is now v{evidenceVersion}.</div>
      )}
      <div className="text-xs text-muted-foreground" data-testid="review-saved-info">
        {saved.updated_at ? <>Last saved {fmtTs(saved.updated_at.slice(0, 19))} UTC{saved.reviewer ? ` by ${saved.reviewer}` : ""}{saved.reviewed_at ? " · marked reviewed" : ""}</> : "No review saved yet."}
      </div>
    </div>
  );
};
