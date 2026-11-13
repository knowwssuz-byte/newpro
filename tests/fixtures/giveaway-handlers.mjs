import { HttpError, readJson, readForm, securityError } from '../../lib/security/http.mjs';
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import { joinedBalance, publicBoard } from "../../lib/giveawayServer.mjs";

export function supabaseAdapter(db) {
  return {
    async rpc(name, params = {}) {
      if (!/^newpro_giveaway_[a-z_0-9]+$/.test(name))
        throw Error("Unexpected RPC in giveaway test: " + name);
      try {
        const names = Object.keys(params);
        const sql = `select public.${name}(${names.map((key, i) => `${key}=>$${i + 1}`).join(",")}) as result`;
        const value = await db.query(sql, Object.values(params));
        return { data: value.rows[0].result, error: null };
      } catch (error) {
        return {
          data: null,
          error: { message: error.message, code: error.code },
        };
      }
    },
    from(table) {
      if (!["users", "giveaways"].includes(table))
        throw Error("Unexpected test table: " + table);
      let columns = "*",
        limit = null;
      const where = [],
        values = [];
      const run = async (single) => {
        try {
          const result = await db.query(
            `select ${columns} from public.${table}${where.length ? " where " + where.join(" and ") : ""}${limit ? " limit " + limit : ""}`,
            values,
          );
          return {
            data: single ? result.rows[0] || null : result.rows,
            error: null,
          };
        } catch (error) {
          return {
            data: null,
            error: { message: error.message, code: error.code },
          };
        }
      };
      const builder = {
        select(value) {
          if (!/^[a-z_,*]+$/.test(value)) throw Error("Invalid test selector");
          columns = value;
          return this;
        },
        eq(key, value) {
          values.push(value);
          where.push(`${key}=$${values.length}`);
          return this;
        },
        lte(key, value) {
          values.push(value);
          where.push(`${key}<=$${values.length}`);
          return this;
        },
        limit(value) {
          limit = Number(value);
          return this;
        },
        single() {
          return run(true);
        },
        maybeSingle() {
          return run(true);
        },
        then(resolve, reject) {
          return run(false).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

// Execute the real route bodies with isolated dependencies. Only the import
// declarations and ESM export keywords are removed; no route logic is replaced.
async function routeFactory(path, dependencies) {
  const source = await readFile(
    new URL("../../" + path, import.meta.url),
    "utf8",
  );
  const body = source
    .slice(source.indexOf("export const runtime"))
    .replace(/^export /gm, "");
  return new Function(...Object.keys(dependencies), body + "\nreturn POST;")(
    ...Object.values(dependencies),
  );
}
export async function giveawayHandlers(db, options = {}) {
  const adapter = supabaseAdapter(db);
  const publicPost = await routeFactory("app/api/giveaway/route.js", {
    getSupabaseAdmin: () => adapter,
    joinedBalance,
    publicBoard,
    readTelegramRequest: async (request) => {
      const body = await request.json();
      return body.initData === "isolated-qa-session"
        ? { ok: true, body, telegramUser: { id: options.userId || 1 } }
        : { ok: false, error: "Unauthorized test session", status: 401 };
    },
    jsonError: (error, status) =>
      Response.json({ ok: false, error }, { status }),
  });
  process.env.ADMIN_PANEL_KEY = "isolated-qa-admin";
  const adminPost = await routeFactory("app/api/browser-admin/route.js", {
    crypto, HttpError, readJson, readForm, securityError,
    guardRequest: async () => {},
    assertAdminSession: async (request) => {
      if (!request.headers.get('cookie')?.includes('newpro_admin=isolated-qa-session')) throw new HttpError(401, 'Unauthorized test session');
    },
    NextResponse: Response,
    getSupabaseAdmin: () => adapter,
  });
  return { publicPost, adminPost, adapter };
}
