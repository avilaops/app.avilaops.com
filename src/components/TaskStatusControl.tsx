"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const statuses = [
  { value: "TODO", label: "A fazer" },
  { value: "IN_PROGRESS", label: "Em andamento" },
  { value: "BLOCKED", label: "Bloqueada" },
  { value: "DONE", label: "Concluída" },
];

export default function TaskStatusControl({
  taskId,
  status,
}: {
  taskId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [current, setCurrent] = useState(status);

  async function updateStatus(nextStatus: string) {
    if (nextStatus === current) return;
    setPending(true);
    const previous = current;
    setCurrent(nextStatus);

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      setCurrent(previous);
    } finally {
      setPending(false);
    }
  }

  return (
    <select
      className={`task-status-select status-${current.toLowerCase().replace(/_/g, "-")}`}
      value={current}
      disabled={pending}
      onChange={(event) => updateStatus(event.target.value)}
      aria-label="Estado da tarefa"
    >
      {statuses.map((option) => (
        <option value={option.value} key={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
