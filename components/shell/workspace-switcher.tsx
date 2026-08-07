import { setActiveOrganization, setActiveSite } from "@/features/workspace/actions";
import { t, type Locale } from "@/lib/i18n/messages";
import type { WorkspaceOrganization, WorkspaceSite } from "@/lib/auth/workspace";

type Choice = { id: string; name: string };

/**
 * The switcher sits on the dark brand panel, so every element states its own colour. Inheriting from
 * the panel previously left the labels and buttons at roughly 1.6:1 against their background —
 * technically rendered, practically invisible.
 *
 * The select also takes the full width rather than sharing a row with the button, because
 * organization and site names in the field are long enough to be cut off otherwise.
 */
function SwitcherForm({
  action,
  label,
  name,
  choices,
  selectedId,
  switchLabel,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  label: string;
  name: string;
  choices: Choice[];
  selectedId: string | undefined;
  switchLabel: string;
  children?: React.ReactNode;
}) {
  const selectedName = choices.find((choice) => choice.id === selectedId)?.name;
  return (
    <form action={action} className="space-y-1.5">
      {children}
      <label className="block font-medium text-emerald-100" htmlFor={name}>{label}</label>
      <select
        id={name}
        name={name}
        defaultValue={selectedId}
        // The closed field truncates a long name, so the full text stays available on hover.
        title={selectedName}
        className="w-full rounded-md border border-emerald-700 bg-white px-2 py-2 text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
      >
        {choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.name}</option>)}
      </select>
      <div className="flex justify-end">
        <button
          type="submit"
          className="rounded-md border border-emerald-600 bg-emerald-800 px-3 py-1 text-xs font-semibold text-emerald-50 transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        >
          {switchLabel}
        </button>
      </div>
    </form>
  );
}

export function WorkspaceSwitcher({ organizations, activeOrganization, sites, activeSite, locale }: { organizations: WorkspaceOrganization[]; activeOrganization: WorkspaceOrganization; sites: WorkspaceSite[]; activeSite: WorkspaceSite | null; locale: Locale }) {
  return (
    <div className="space-y-4 text-sm">
      <SwitcherForm
        action={setActiveOrganization}
        label={t(locale, "organization")}
        name="organizationId"
        choices={organizations}
        selectedId={activeOrganization.id}
        switchLabel={t(locale, "switch")}
      />
      {sites.length > 0 && (
        <SwitcherForm
          action={setActiveSite}
          label={t(locale, "mineSite")}
          name="siteId"
          choices={sites}
          selectedId={activeSite?.id}
          switchLabel={t(locale, "switch")}
        >
          <input name="organizationId" type="hidden" value={activeOrganization.id} />
        </SwitcherForm>
      )}
    </div>
  );
}
