import { useTranslation } from "next-i18next";
import type { Dispatch, SetStateAction } from "react";
import { Button } from "../../components/ui/button";
export function LetterFacts({
  loaded,
  entries,
  selected,
  setSelected,
  error,
  busy,
  onLoad,
}: {
  loaded: boolean;
  entries: Array<{ id: string; title: string; organization: string }>;
  selected: string[];
  setSelected: Dispatch<SetStateAction<string[]>>;
  error: boolean;
  busy: boolean;
  onLoad: () => void;
}) {
  const { t } = useTranslation("common");
  return (
    <div className="my-3 space-y-2 text-sm">
      <p>{t("consent.careerScope")}</p>
      {!loaded && (
        <Button variant="secondary" onClick={onLoad}>
          {t("consent.chooseFacts")}
        </Button>
      )}
      {error && <p role="alert">{t("consent.error")}</p>}
      {loaded &&
        entries.map((entry) => (
          <label key={entry.id} className="flex min-h-10 items-start gap-2">
            <input
              className="mt-1"
              type="checkbox"
              checked={selected.includes(entry.id)}
              disabled={
                busy || (!selected.includes(entry.id) && selected.length >= 3)
              }
              onChange={(e) =>
                setSelected((ids) =>
                  e.target.checked
                    ? [...ids, entry.id]
                    : ids.filter((id) => id !== entry.id),
                )
              }
            />
            <span>
              {entry.title} — {entry.organization}
            </span>
          </label>
        ))}
    </div>
  );
}
