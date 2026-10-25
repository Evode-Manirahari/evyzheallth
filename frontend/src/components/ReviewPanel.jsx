import { useEffect, useState } from "react";
import { toast } from "sonner";
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
  useEffect(() => { setNote(initial.note || ""); setStatus(initial.status || "unreviewed"); setSaved(initial); }, [initial]);
  const dirty = note !== (saved.note || "") || status !== (saved.status || "unreviewed");

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.put(`/events/${eventId}/review`, { note, status });
      setSaved(data);
      toast.success("Review saved");
    } catch (e) {
      toast.error(`Could not save review: ${errMsg(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel p-5 space-y-4" data-testid="review-panel">
      <div className="font-semibold">Human review</div>
      <div className="text-xs text-muted-foreground">Change status: <span className="font-medium text-foreground" data-testid="review-change-ended">{ended ? "Ended" : "Not ended at end of data"}</span>. Review status is recorded separately.</div>
      <RadioGroup value={status} onValueChange={setStatus} className="gap-2" aria-label="Review status">
        <div className="flex items-center gap-2"><RadioGroupItem value="unreviewed" id="st-un" data-testid="review-status-unreviewed" /><Label htmlFor="st-un">Not reviewed</Label></div>
        <div className="flex items-center gap-2"><RadioGroupItem value="reviewed" id="st-rv" data-testid="review-status-reviewed" /><Label htmlFor="st-rv">Reviewed</Label></div>
      </RadioGroup>
      <div className="space-y-1.5">
        <Label htmlFor="review-note">Reviewer note</Label>
        <Textarea id="review-note" rows={6} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observations, follow-up context…" className="bg-white" data-testid="review-note-input" />
      </div>
      <Button className="w-full" onClick={save} disabled={busy || (!dirty && !!saved.updated_at)} data-testid="review-save-button">{busy ? "Saving…" : dirty || !saved.updated_at ? "Save review" : "Saved"}</Button>
      {saved.evidence_version_at_review && saved.evidence_version_at_review !== evidenceVersion && (
        <div className="text-xs tag-change rounded p-2" data-testid="review-outdated-evidence">This review was saved on evidence v{saved.evidence_version_at_review}; the evidence is now v{evidenceVersion}.</div>
      )}
      <div className="text-xs text-muted-foreground" data-testid="review-saved-info">
        {saved.updated_at ? <>Last saved {fmtTs(saved.updated_at.slice(0, 19))} UTC{saved.reviewer ? ` by ${saved.reviewer}` : ""}{saved.reviewed_at ? " · marked reviewed" : ""}</> : "No review saved yet."}
      </div>
    </div>
  );
};
