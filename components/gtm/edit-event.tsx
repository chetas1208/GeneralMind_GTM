"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export type EditableEvent = {
  id: string;
  name: string;
  description: string | null;
  websiteUrl: string | null;
  registrationUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  venue: string | null;
  industryTags: string[];
  audienceTags: string[];
  targetPersonas: string[];
  relevanceReason: string | null;
};

const csv = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function EditEventSheet({ event }: { event: EditableEvent }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(form: FormData) {
    const get = (k: string) => String(form.get(k) ?? "").trim();
    const body = {
      name: get("name"),
      description: get("description") || null,
      websiteUrl: get("websiteUrl") || null,
      registrationUrl: get("registrationUrl") || null,
      startDate: get("startDate") || null,
      endDate: get("endDate") || null,
      city: get("city") || null,
      region: get("region") || null,
      country: get("country") || null,
      venue: get("venue") || null,
      industryTags: csv(get("industryTags")),
      audienceTags: csv(get("audienceTags")),
      targetPersonas: csv(get("targetPersonas")),
      relevanceReason: get("relevanceReason") || null,
    };
    start(async () => {
      setError(null);
      const res = await fetch(`/api/events/${event.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.issues ? data.issues.map((i: { path: string; message: string }) => `${i.path}: ${i.message}`).join("; ") : (data.error ?? "Save failed"));
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button size="sm" variant="outline" />}>
        <Pencil />
        Edit
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Edit event</SheetTitle>
          <SheetDescription>Manual corrections are preserved. Relevance is recomputed only when you re-run discovery.</SheetDescription>
        </SheetHeader>
        <form action={submit} className="space-y-3 px-4 pb-4">
          <Field label="Name">
            <Input name="name" defaultValue={event.name} required />
          </Field>
          <Field label="Official website">
            <Input name="websiteUrl" type="url" defaultValue={event.websiteUrl ?? ""} />
          </Field>
          <Field label="Registration URL">
            <Input name="registrationUrl" type="url" defaultValue={event.registrationUrl ?? ""} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <Input name="startDate" type="date" defaultValue={event.startDate ?? ""} />
            </Field>
            <Field label="End date">
              <Input name="endDate" type="date" defaultValue={event.endDate ?? ""} />
            </Field>
            <Field label="City">
              <Input name="city" defaultValue={event.city ?? ""} />
            </Field>
            <Field label="Region / state">
              <Input name="region" defaultValue={event.region ?? ""} />
            </Field>
            <Field label="Country">
              <Input name="country" defaultValue={event.country ?? ""} />
            </Field>
            <Field label="Venue">
              <Input name="venue" defaultValue={event.venue ?? ""} />
            </Field>
          </div>
          <Field label="Description">
            <Textarea name="description" rows={3} defaultValue={event.description ?? ""} />
          </Field>
          <Field label="Industries (comma separated)">
            <Input name="industryTags" defaultValue={event.industryTags.join(", ")} />
          </Field>
          <Field label="Audience (comma separated)">
            <Input name="audienceTags" defaultValue={event.audienceTags.join(", ")} />
          </Field>
          <Field label="Target personas (comma separated)">
            <Input name="targetPersonas" defaultValue={event.targetPersonas.join(", ")} />
          </Field>
          <Field label="Why it matters">
            <Textarea name="relevanceReason" rows={3} defaultValue={event.relevanceReason ?? ""} />
          </Field>
          {error && <p className="rounded-md bg-red-50 p-2 text-xs text-red-800">{error}</p>}
          <SheetFooter className="px-0">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
