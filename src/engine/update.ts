// Update check: is there a newer successful build (or release) than the one running, where to
// download it, and what changed. Pure — the store fetches the GitHub API and calls this.

export interface RunLite {
  head_sha: string;
  html_url: string;
  created_at: string;
  head_commit?: { message?: string };
}
export interface ReleaseLite {
  html_url: string;
  published_at?: string;
  tag_name?: string;
  assets?: Array<{ name: string; browser_download_url: string }>;
}

export interface UpdateOffer {
  sha: string;
  date: string;
  message: string;
  /** Where to download: the release zip when there's a newer release, else the build's page. */
  url: string;
  kind: "release" | "build";
  /** Commit titles since your build (newest first), when known. */
  changes: string[];
}

export function pickUpdate(o: { buildSha: string; buildDate: string; run?: RunLite; release?: ReleaseLite; changes?: string[] }): UpdateOffer | undefined {
  const { run, release } = o;
  if (o.buildSha === "dev" || !run || run.head_sha === o.buildSha || !(run.created_at > o.buildDate)) return undefined;
  const asset = release?.assets?.find((a) => /portable.*\.zip$|\.zip$/i.test(a.name));
  const releaseNewer = !!release?.published_at && release.published_at > o.buildDate && !!asset;
  return {
    sha: run.head_sha,
    date: run.created_at,
    message: (run.head_commit?.message ?? "").split("\n")[0],
    url: releaseNewer ? asset!.browser_download_url : run.html_url,
    kind: releaseNewer ? "release" : "build",
    changes: (o.changes ?? []).map((c) => c.split("\n")[0]).filter(Boolean).slice(0, 15),
  };
}
