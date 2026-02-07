import { Form, redirect, useActionData } from "react-router";
import type { Route } from "./+types/teams.new";
import { createTeam, slugExists } from "~/lib/db.server";
import { generateSlug } from "~/lib/utils";
import { EmojiPicker } from "~/components/emoji-picker";

export function meta() {
  return [{ title: "Create Team - Rift Legends" }];
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const name = (formData.get("name") as string || "").trim();

  if (!name) {
    return { error: "Team name is required" };
  }
  if (name.length < 2 || name.length > 50) {
    return { error: "Team name must be between 2 and 50 characters" };
  }

  let slug = generateSlug(name);
  if (!slug) {
    return { error: "Team name must contain at least one letter or number" };
  }

  // Handle duplicate slugs by appending a suffix
  let finalSlug = slug;
  let suffix = 2;
  while (slugExists(finalSlug)) {
    finalSlug = `${slug}-${suffix}`;
    suffix++;
  }

  const emoji = (formData.get("emoji") as string || "").trim() || null;

  createTeam(name, finalSlug, emoji ?? undefined);
  throw redirect(`/teams/${finalSlug}`);
}

export default function NewTeam() {
  const actionData = useActionData<typeof action>();

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
        Create a Team
      </h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Give your team a name. You can add members after creating it.
      </p>

      <Form method="post" className="mt-6">
        <div className="flex gap-3">
          <div className="flex-shrink-0">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Icon
            </label>
            <div className="mt-1">
              <EmojiPicker name="emoji" />
            </div>
          </div>
          <div className="flex-1">
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Team Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              maxLength={50}
              placeholder="e.g. Friday Night Crew"
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            />
          </div>
        </div>

        {actionData?.error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {actionData.error}
          </p>
        )}

        <button
          type="submit"
          className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          Create Team
        </button>
      </Form>
    </main>
  );
}
