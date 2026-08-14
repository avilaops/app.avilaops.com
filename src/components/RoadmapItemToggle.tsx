"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  id: string;
  label: string;
  owner: string | null;
  done: boolean;
};

export default function RoadmapItemToggle({ id, label, owner, done }: Props) {
  const router = useRouter();
  const [checked, setChecked] = useState(done);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !checked;
    setChecked(next);
    setSaving(true);
    try {
      const response = await fetch(`/api/partner-network/roadmap/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ done: next }),
      });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      setChecked(!next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className={checked ? "roadmap-item roadmap-item-done" : "roadmap-item"}>
      <button
        type="button"
        className="roadmap-checkbox"
        aria-pressed={checked}
        disabled={saving}
        onClick={toggle}
      >
        <span aria-hidden="true">{checked ? "✓" : ""}</span>
      </button>
      <span className="roadmap-label">
        {label}
        {checked && owner ? <small>{owner}</small> : null}
      </span>
    </li>
  );
}
