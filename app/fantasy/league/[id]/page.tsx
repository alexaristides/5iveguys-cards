"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AppShell, ErrorText, Spinner } from "@/components/AppShell";
import { api, LeaderHeader, LeaderRow, useDismiss, useShareInvite, type FantasyLeagueRow } from "@/components/fantasy/FantasyLeagues";

interface Standings {
  league: { id: string; name: string; code: string; isMember: boolean };
  lastGameweek: number | null;
  /** Everyone in the league; big leagues only send the top 100 and your row in `teams`. */
  teamCount?: number;
  teams: FantasyLeagueRow[];
}
interface Leaderboard { teams: FantasyLeagueRow[]; me: FantasyLeagueRow | null; teamCount: number; lastGameweek: number | null }

/**
 * A league table, as in the app (mobile/src/app/fantasy/league/[id].tsx): "overall" is everyone (the
 * Leagues tab's "Everyone"), anything else a private league. Click a team for its latest points.
 */
export default function FantasyLeaguePage() {
  const { id } = useParams<{ id: string }>();
  return id === "overall" ? <Overall /> : <Private id={id} />;
}

/** A team's latest gameweek, or its season so far before the first gameweek is scored. */
const teamHref = (row: FantasyLeagueRow, lastGameweek: number | null) =>
  lastGameweek ? `/fantasy/gameweek/${lastGameweek}?teamId=${row.id}` : `/fantasy/history?teamId=${row.id}`;

const teamsLine = (count: number) => `${count} team${count === 1 ? "" : "s"}`;
const sub = "text-ink-2 text-[14px] mb-3.5";

function Table({ rows, lastGameweek, me }: { rows: FantasyLeagueRow[]; lastGameweek: number | null; me?: FantasyLeagueRow | null }) {
  return (
    <>
      {me && !rows.some((t) => t.id === me.id) && (
        <div className="mb-3"><LeaderRow row={me} mine href={teamHref(me, lastGameweek)} /></div>
      )}
      <LeaderHeader />
      <div className="flex flex-col gap-1.5">
        {rows.map((t) => <LeaderRow key={t.id} row={t} mine={t.mine || t.id === me?.id} href={teamHref(t, lastGameweek)} />)}
      </div>
    </>
  );
}

function Overall() {
  const [data, setData] = useState<Leaderboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const signedIn = useSession().status === "authenticated";

  useEffect(() => {
    if (signedIn) api<Leaderboard>("/api/fantasy/leaderboard?limit=100").then(setData, (err: Error) => setError(err.message));
  }, [signedIn]);

  return (
    <AppShell title="Everyone" back="/leagues">
      <div>
        <p className={sub}>
          {data ? teamsLine(data.teamCount) : "\u00A0"}
          {data?.lastGameweek ? ` · after gameweek ${data.lastGameweek}` : ""}
        </p>
        {!data ? (error ? <ErrorText>{error}</ErrorText> : <Spinner />) : (
          <>
            <Table rows={data.teams} lastGameweek={data.lastGameweek} me={data.me} />
            {data.teams.length === 0 && <p className={sub}>No teams yet — be the first.</p>}
          </>
        )}
      </div>
    </AppShell>
  );
}

function Private({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<Standings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const { share, copied } = useShareInvite();
  const signedIn = useSession().status === "authenticated";

  useEffect(() => {
    if (signedIn) api<Standings>(`/api/fantasy/leagues/${id}`).then(setData, (err: Error) => setError(err.message));
  }, [id, signedIn]);

  const closeMenu = useCallback(() => setMenu(false), []);

  async function leave() {
    if (!data) return;
    const last = (data.teamCount ?? data.teams.length) === 1;
    if (!window.confirm(`Leave this league?\n\n${last ? "You're the last one in it, so the league will be deleted." : "You can rejoin with the code."}`)) return;
    try {
      await api(`/api/fantasy/leagues/${id}`, { method: "DELETE" });
      router.replace("/leagues");
    } catch (err) {
      window.alert(`Couldn't leave the league\n\n${(err as Error).message}`);
    }
  }

  const count = data ? data.teamCount ?? data.teams.length : 0;
  return (
    <AppShell
      title={data?.league.name ?? "League"}
      back="/leagues"
      right={data?.league.isMember ? (
        <button type="button" onClick={() => setMenu(true)} className="text-violet-600 hover:text-violet-700 text-[18px] font-black px-1" aria-label="League options" aria-haspopup="dialog">
          •••
        </button>
      ) : null}
    >
      <div>
        {!data ? (error ? <ErrorText>{error}</ErrorText> : <Spinner />) : (
          <>
            <button
              type="button"
              onClick={() => share(data.league)}
              className="w-full flex items-center text-left rounded-[18px] bg-violet-100 p-3.5 mb-3 leading-tight hover:bg-violet-200/70 active:opacity-70 transition"
            >
              <span className="flex-1">
                <span className="block text-ink-3 text-[12px] font-bold">League code</span>
                <span className="block text-violet-600 text-[26px] font-black tracking-[3px]">{data.league.code}</span>
              </span>
              <span className="text-violet-600 text-[16px] font-black">{copied ? "Copied" : "Invite mates ›"}</span>
            </button>
            <p className={sub}>
              {teamsLine(count)}{data.lastGameweek ? ` · after gameweek ${data.lastGameweek}` : ""}
            </p>
            <Table rows={data.teams} lastGameweek={data.lastGameweek} />
          </>
        )}
      </div>

      {menu && data && (
        <ActionSheet
          title={data.league.name}
          message={`Code ${data.league.code}`}
          onClose={closeMenu}
          options={[
            { label: "Invite friends", onPress: () => { setMenu(false); share(data.league); } },
            // The sheet goes before the question, as on iOS.
            { label: "Leave league", destructive: true, onPress: () => { setMenu(false); setTimeout(leave, 0); } },
          ]}
        />
      )}
    </AppShell>
  );
}

/** The app's iOS action sheet (light): a titled group of options and Cancel, from the bottom on phones. */
function ActionSheet({ title, message, options, onClose }: {
  title: string; message: string; options: { label: string; destructive?: boolean; onPress: () => void }[]; onClose: () => void;
}) {
  useDismiss(onClose);
  return (
    <div className="fixed inset-0 z-50 [color-scheme:light]" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" tabIndex={-1} className="absolute inset-0 bg-black/30 cursor-default" aria-label="Cancel" onClick={onClose} />
      <div
        className="absolute inset-x-2 bottom-[calc(8px+env(safe-area-inset-bottom))] flex flex-col gap-2
          md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[400px]"
      >
        <div className="rounded-[14px] bg-white/95 backdrop-blur-xl overflow-hidden text-center divide-y divide-black/10">
          <div className="px-4 py-3.5">
            <div className="text-[#8A8A8E] text-[13px] font-semibold leading-tight">{title}</div>
            <div className="text-[#8A8A8E] text-[13px] leading-tight mt-1">{message}</div>
          </div>
          {options.map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={o.onPress}
              className={`block w-full h-[57px] text-[20px] hover:bg-black/[0.03] active:bg-black/5 ${o.destructive ? "text-[#FF3B30]" : "text-[#007AFF]"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="h-[57px] rounded-[14px] bg-white text-[#007AFF] text-[20px] font-semibold hover:bg-[#f7f7f7] active:bg-[#ececec]">
          Cancel
        </button>
      </div>
    </div>
  );
}
