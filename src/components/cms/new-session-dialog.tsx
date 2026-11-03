import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";

import { Field, FormErrorList } from "@/components/cms/form-section";
import { useFormErrors } from "@/components/cms/use-form-errors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { $createSession } from "@/features/sessions/functions";
import { workshopsQueryOptions } from "@/features/workshops/functions";

const DEFAULT_START_TIME = "09:00";
const DEFAULT_END_TIME = "17:00";
const SESSION_FIELDS = ["workshopId", "date", "endDate", "startTime", "endTime"];

type NewSessionDialogProps = {
  defaultWorkshopId?: string;
  defaultOpen?: boolean;
};

export function NewSessionDialog({
  defaultWorkshopId,
  defaultOpen = false
}: NewSessionDialogProps) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [workshopId, setWorkshopId] = useState(defaultWorkshopId ?? "");
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState(DEFAULT_START_TIME);
  const [endTime, setEndTime] = useState(DEFAULT_END_TIME);
  const { fieldErrors, generalErrors, showErrors, clearFieldErrors, clearErrors } =
    useFormErrors(SESSION_FIELDS);

  const workshops = useQuery({ ...workshopsQueryOptions({ status: "active" }), enabled: isOpen });

  const create = useMutation({
    mutationFn: () =>
      $createSession({ data: { workshopId, times: { date, endDate, startTime, endTime } } }),
    onSuccess: async ({ id }) => {
      setIsOpen(false);
      await navigate({ to: "/content/sessions/$id", params: { id } });
    },
    onError: showErrors
  });

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        clearErrors();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus />
          New session
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>New session</DialogTitle>
            <DialogDescription>
              Venue, price and capacity start from the workshop defaults.
            </DialogDescription>
          </DialogHeader>
          <Field label="Workshop" htmlFor="new-session-workshop" errors={fieldErrors.workshopId}>
            <Select
              value={workshopId}
              onValueChange={(value) => {
                setWorkshopId(value);
                clearFieldErrors("workshopId");
              }}
            >
              <SelectTrigger id="new-session-workshop" className="w-full">
                <SelectValue placeholder="Pick a workshop" />
              </SelectTrigger>
              <SelectContent>
                {workshops.data?.items.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="First day" htmlFor="new-session-date" errors={fieldErrors.date}>
              <Input
                id="new-session-date"
                type="date"
                required
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  clearFieldErrors("date");
                }}
              />
            </Field>
            <Field
              label="Last day"
              htmlFor="new-session-end-date"
              errors={fieldErrors.endDate}
              hint="Empty for one day."
            >
              <Input
                id="new-session-end-date"
                type="date"
                min={date || undefined}
                value={endDate}
                onChange={(event) => {
                  setEndDate(event.target.value);
                  clearFieldErrors("endDate");
                }}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Starts each day"
              htmlFor="new-session-start"
              errors={fieldErrors.startTime}
            >
              <Input
                id="new-session-start"
                type="time"
                required
                value={startTime}
                onChange={(event) => {
                  setStartTime(event.target.value);
                  clearFieldErrors("startTime");
                }}
              />
            </Field>
            <Field label="Ends each day" htmlFor="new-session-end" errors={fieldErrors.endTime}>
              <Input
                id="new-session-end"
                type="time"
                required
                value={endTime}
                onChange={(event) => {
                  setEndTime(event.target.value);
                  clearFieldErrors("endTime");
                }}
              />
            </Field>
          </div>
          <FormErrorList messages={generalErrors} />
          <DialogFooter>
            <Button type="submit" disabled={!workshopId || create.isPending}>
              Create draft
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
