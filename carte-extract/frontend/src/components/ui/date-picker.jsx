import React from "react";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseDateFRToDate, formatDateFR } from "../../utils/dates";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function DatePicker({ value, onChange, placeholder = "jj/mm/aaaa", className }) {
  const [open, setOpen] = React.useState(false);
  const selected = parseDateFRToDate(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal h-auto py-2 bg-white text-[var(--ink)]",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-1" size={13} />
          {value || placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            onChange(formatDateFR(date));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
