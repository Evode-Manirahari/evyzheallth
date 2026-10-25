import { toast } from "sonner";
import { useApi, useFetch, errMsg } from "../lib/api";
import { Loading, ErrorBox } from "../components/StateViews";
import { useMe } from "../components/AccessGate";

export default function TeamPage() {
  const api = useApi();
  const me = useMe();
  const { data, error, loading, reload } = useFetch("/users");
  const change = async (uid, role) => {
    try {
      await api.patch(`/users/${uid}/role`, { role });
      toast.success("Access updated");
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  if (me?.role !== "admin") return <ErrorBox message="Only admins can manage team access." />;
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <div className="eyebrow">Team</div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">Team access</h1>
        <p className="text-sm text-muted-foreground mt-1">New accounts start as <b>pending</b> and cannot see participant data until approved as clinician or admin.</p>
      </div>
      <div className="panel overflow-x-auto">
        <table className="w-full text-sm" data-testid="team-table">
          <thead className="bg-secondary/60 text-left"><tr className="eyebrow"><th className="px-4 py-2">Email</th><th className="px-4 py-2">Access</th></tr></thead>
          <tbody>{data.users.map((u) => (
            <tr key={u.user_id} className="border-t">
              <td className="px-4 py-2 mono">{u.email || u.user_id}</td>
              <td className="px-4 py-2">
                <select aria-label={`Access for ${u.email}`} className="h-8 rounded-md border bg-white px-2" value={u.role} onChange={(e) => change(u.user_id, e.target.value)} data-testid={`team-role-${u.user_id}`}>
                  {data.roles.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
