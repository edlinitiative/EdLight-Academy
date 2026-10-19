/**
 * Competition workspace: public identity (no raw uid on screen) and
 * French / Kreyòl coverage of labels and server error codes.
 */
import * as fs from "fs";
import * as path from "path";
import ts from "typescript";
import {
  copyFor,
  rowCopy,
  rowPerson,
  taskPayload,
  workspacePage,
  type Copy,
  type WorkspacePage,
} from "../../shared/competition/workspace";
import { workspaceError } from "../../shared/competition/client";
import { COMPETITION_ERROR_MESSAGES } from "../../shared/competition/errors";
import {
  ALL_LABEL_MAPS,
  formatInviteCode,
  haitiDate,
} from "../../shared/competition/labels";

const ALICE = "uidAliceXq7Lm2Pz9Rt4Ks8Vw1Yb3";
const BOB = "uidBobN5Hc6Jd0Fg2Qa7Ue4Ti9Wo1";
const CARA = "uidCaraM3Kp8Ls1Dz6Xn0Vb5Rq7Yt";
const DAN = "uidDanH4Gf9Je2Wq6Pk1Lz8Mx3Cv0";
const UIDS = [ALICE, BOB, CARA, DAN];
const people = {
  [ALICE]: { name: "Alice", avatar: "1000000000000000" },
  [BOB]: { name: "Bob", avatar: null },
  [CARA]: { name: "Compte supprimé", avatar: null },
  // DAN is unknown: shown as a localized "Participant".
};

/** Every string a renderer would print, in both languages. */
function printed(page: WorkspacePage): string[] {
  const out: string[] = [];
  const add = (c?: Copy) => c && out.push(c[0], c[1]);
  add(page.title);
  for (const p of page.panels) {
    add(p.title);
    p.paragraphs?.forEach(add);
    p.rows?.forEach((r) => add(rowCopy(r)));
    p.links?.forEach((l) => add(l.label));
    for (const t of p.tasks || []) {
      add(t.label);
      add(t.confirm);
      for (const f of t.fields || []) {
        add(f.label);
        f.options?.forEach((o) => add(o.label));
      }
    }
  }
  return out;
}
const expectNoUid = (page: WorkspacePage) => {
  const text = printed(page).join("\n");
  for (const uid of UIDS) expect(text).not.toContain(uid);
};

const team = {
  team: {
    id: "team1",
    name: "Les Lions",
    captainUid: ALICE,
    members: [ALICE, BOB, CARA, DAN],
    schoolKey: null,
    visibility: "private",
  },
  invites: [
    { id: "inv1", recipientUid: DAN, senderUid: ALICE, status: "pending" },
  ],
  requests: [{ uid: BOB, publicName: "Bob", status: "pending" }],
  people,
};

const event = {
  event: {
    id: "ev1",
    title: "Coupe",
    description: "Quiz",
    hostName: "Alice",
    hostKind: "school",
    audience: "school",
    entryPolicy: "approval",
    entryMode: "named_team",
    delivery: "physical",
    state: "published",
    config: {
      format: "window",
      questionCount: 10,
      secondsPerQuestion: 20,
      startsAt: 2_000_000_000_000,
    },
    registrationClosesAt: 1_999_000_000_000,
    resultStatus: "pending",
    resultRows: [{ entryId: DAN, score: 70, label: null }],
    reward: { description: "Livres", provider: "Lib", contact: "x" },
  },
  entries: [
    {
      id: "team1",
      teamId: "team1",
      captainUid: ALICE,
      label: "Les Lions",
      starters: [ALICE, BOB, CARA],
      confirmed: [ALICE],
      state: "registered",
    },
    {
      id: DAN,
      teamId: null,
      captainUid: DAN,
      label: "Dan",
      starters: [DAN],
      confirmed: [DAN],
      state: "draft",
    },
  ],
  cohosts: { [BOB]: "checkin" },
  people,
  announcements: [],
  disputes: [{ id: "d1", reason: "Erreur", state: "open" }],
  rewards: [{ entryId: DAN, status: "fulfilled" }],
  namedTeams: [],
  role: "manager",
  eligible: true,
};

const mine = {
  uid: ALICE,
  inviteCode: "K7Q2M9XD",
  people,
  teams: [team.team],
  memberships: [{ schoolKey: "lycee", status: "approved" }],
  roles: [{ status: "approved" }],
  admin: true,
  creationEnabled: true,
  membershipRequests: [{ uid: DAN, schoolKey: "lycee", status: "pending" }],
  moderationReports: [{ id: "r1", kind: "team", reason: "Nom" }],
};

describe("public identity", () => {
  it("team page names members, requests and invitations without uids", () => {
    const page = workspacePage({ kind: "team", id: "team1" }, team, mine, 0);
    expectNoUid(page);
    const members = page.panels[1].rows!;
    expect(rowPerson(members[0])).toMatchObject({
      uid: ALICE,
      avatar: "1000000000000000",
    });
    expect(copyFor(rowCopy(members[0]), false)).toBe("Alice · Capitaine");
    expect(copyFor(rowCopy(members[0]), true)).toBe("Alice · Kapitèn");
    // Deleted-account sentinel and unknown people render as names.
    expect(copyFor(rowCopy(members[2]), false)).toBe("Compte supprimé");
    expect(copyFor(rowCopy(members[3]), true)).toBe("Patisipan");
    const transfer = page.panels[1].tasks!.find((t) => t.id === "transfer")!;
    expect(transfer.fields![0].options!.map((o) => o.value)).toEqual([
      BOB,
      CARA,
      DAN,
    ]);
    expect(transfer.fields![0].options![0].label).toEqual(["Bob", "Bob"]);
    const invite = page.panels[1].tasks!.find((t) => t.id === "invite")!;
    expect(invite.fields!.map((f) => f.key)).toEqual(["recipientCode"]);
  });

  it("event page shows starters, rewards, results and check-in by name", () => {
    const page = workspacePage(
      { kind: "event", id: "ev1" },
      event,
      mine,
      1_000_000_000_000,
    );
    expectNoUid(page);
    const tasks = page.panels.flatMap((p) => p.tasks || []);
    const checkin = tasks.find((t) => t.action === "checkin")!;
    expect(checkin.fields![0].options!.map((o) => o.value)).toEqual([
      ALICE,
      BOB,
      CARA,
    ]);
    const roster = tasks.find((t) => t.id === "roster-team1")!;
    expect(roster.fields!.map((f) => f.key)).toEqual([
      "starter1",
      "starter2",
      "starter3",
    ]);
    const cohost = tasks.find((t) => t.id === `cohost-${BOB}`)!;
    expect(cohost.person?.name).toBe("Bob");
    const reward = tasks.find((t) => t.action === "reward-update")!;
    expect(reward.fields![0].options).toEqual([
      { value: "team1", label: ["Les Lions", "Les Lions"] },
    ]);
  });

  it("home and invite pages never show the account identifier", () => {
    const home = workspacePage(
      { kind: "home" },
      { events: [], summaries: [], schools: [{ key: "lycee", name: "Lycée" }] },
      mine,
      0,
    );
    expectNoUid(home);
    expect(printed(home).join("\n")).toContain("K7Q2-M9XD");
    const review = home.panels
      .flatMap((p) => p.tasks || [])
      .find((t) => t.id.startsWith("membership-lycee"))!;
    expect(review.label).toEqual(["Participant · Lycée", "Patisipan · Lycée"]);
    const invite = workspacePage(
      { kind: "invite", id: "inv1" },
      {
        invite: {
          teamName: "Les Lions",
          status: "pending",
          expiresAt: 2_000_000_000_000,
          senderUid: ALICE,
          recipientUid: DAN,
          teamId: "team1",
        },
        people,
      },
      { uid: DAN },
      0,
    );
    expectNoUid(invite);
    expect(rowPerson(invite.panels[0].rows![0])?.name).toBe("Alice");
  });
});

describe("French and Kreyòl", () => {
  it("labels every enum in both languages, Kreyòl never a copy of French", () => {
    for (const [name, map] of Object.entries(ALL_LABEL_MAPS))
      for (const [value, [fr, ht]] of Object.entries(map)) {
        expect(`${name}.${value}:${fr}`).not.toBe(`${name}.${value}:${ht}`);
        expect(fr && ht).toBeTruthy();
      }
  });

  it("writes dates per language in Haiti time", () => {
    const [fr, ht] = haitiDate(Date.UTC(2026, 9, 12, 18, 30));
    expect(fr).toBe("12 octobre 2026 à 14 h 30 (heure d’Haïti)");
    expect(ht).toBe("12 oktòb 2026 a 14:30 (lè Ayiti)");
    expect(formatInviteCode("K7Q2M9XD")).toBe("K7Q2-M9XD");
  });

  it("renders event state, audience and format through the label maps", () => {
    const page = workspacePage(
      { kind: "event", id: "ev1" },
      event,
      mine,
      1_000_000_000_000,
    );
    const text = printed(page);
    for (const raw of ["published", "window", "school ·", "fulfilled", "open"])
      expect(text.some((s) => s.includes(` ${raw}`) || s === raw)).toBe(false);
    expect(text).toEqual(expect.arrayContaining(["Ouverte", "Louvri"]));
  });
});

describe("server error codes", () => {
  /** Every code thrown or returned by the competition API sources. */
  function thrownCodes(): string[] {
    const codes = new Set<string>();
    for (const file of ["api/competition.ts", "api/_lib/competition.ts"]) {
      const source = ts.createSourceFile(
        file,
        fs.readFileSync(path.join(__dirname, "..", "..", file), "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      const literal = (n: ts.Node) => {
        if (ts.isStringLiteral(n)) codes.add(n.text);
        else if (ts.isConditionalExpression(n)) {
          literal(n.whenTrue);
          literal(n.whenFalse);
        } else if (ts.isTemplateExpression(n))
          // `invitation_${invite.status}` — every non-pending status.
          for (const status of ["accepted", "declined", "revoked", "expired"])
            codes.add(`${n.head.text}${status}`);
      };
      const visit = (n: ts.Node) => {
        if (
          ts.isCallExpression(n) &&
          n.expression.getText() === "ensure" &&
          n.arguments[1]
        )
          literal(n.arguments[1]);
        if (
          ts.isNewExpression(n) &&
          n.expression.getText() === "CompetitionError" &&
          n.arguments?.[0]
        )
          literal(n.arguments[0]);
        if (
          ts.isPropertyAssignment(n) &&
          n.name.getText() === "error" &&
          ts.isStringLiteral(n.initializer)
        )
          codes.add(n.initializer.text);
        ts.forEachChild(n, visit);
      };
      visit(source);
    }
    return [...codes].sort();
  }

  it("has a French and Kreyòl message for every code the API can return", () => {
    const codes = thrownCodes();
    expect(codes.length).toBeGreaterThan(80);
    const missing = codes.filter((c) => !COMPETITION_ERROR_MESSAGES[c]);
    expect(missing).toEqual([]);
    for (const code of [
      ...codes,
      "rate_limit_exceeded",
      "unauthorized",
      "network",
      "receipt_unknown",
    ]) {
      const fr = workspaceError(code, false),
        ht = workspaceError(code, true);
      expect(fr).not.toBe(ht);
      expect(fr).not.toContain(code);
    }
  });

  it("falls back to a generic message without leaking the raw code", () => {
    expect(workspaceError("something_new", false)).toBe(
      "Action non confirmée. Vérifiez les conditions puis réessayez.",
    );
    expect(workspaceError("something_new", true)).not.toContain(
      "something_new",
    );
  });
});

describe("payloads chosen by name", () => {
  it("collects starters picked by name and scores per entry", () => {
    expect(
      taskPayload(
        {
          id: "r",
          action: "roster-save",
          label: ["", ""],
          values: { eventId: "e", teamId: "t" },
          fields: ["starter1", "starter2", "starter3"].map((key) => ({
            key,
            label: ["", ""] as Copy,
            type: "select" as const,
            required: true,
          })),
        },
        { starter1: ALICE, starter2: BOB, starter3: CARA },
        0,
      ),
    ).toEqual({
      action: "roster-save",
      eventId: "e",
      teamId: "t",
      starters: [ALICE, BOB, CARA],
    });
    expect(
      taskPayload(
        {
          id: "s",
          action: "event-report-result",
          label: ["", ""],
          values: { eventId: "e", revision: 2 },
          fields: [
            { key: "score:team1", label: ["", ""], type: "number" },
            { key: `score:${DAN}`, label: ["", ""], type: "number" },
          ],
        },
        { "score:team1": "80", [`score:${DAN}`]: "" },
        0,
      ).rows,
    ).toEqual([{ entryId: "team1", score: 80 }]);
  });
});
