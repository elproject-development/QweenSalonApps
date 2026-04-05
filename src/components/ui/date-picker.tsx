"use client"

import * as React from "react"
import { format } from "date-fns"
import { id } from "date-fns/locale"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
  uiVariant?: "default" | "form"
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pilih tanggal",
  className,
  uiVariant = "default",
}: DatePickerProps) {
  const [date, setDate] = React.useState<Date | undefined>(
    value ? new Date(value) : undefined
  )

  const handleSelect = (selectedDate: Date | undefined) => {
    setDate(selectedDate)
    if (selectedDate && onChange) {
      // Format ke YYYY-MM-DD untuk input value
      const year = selectedDate.getFullYear()
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0')
      const day = String(selectedDate.getDate()).padStart(2, '0')
      onChange(`${year}-${month}-${day}`)
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full text-left font-normal",
            uiVariant === "form"
              ? "h-10 sm:h-10 text-sm px-3 justify-between"
              : "h-8 sm:h-9 text-xs justify-start",
            !date && "text-muted-foreground",
            className
          )}
        >
          <span className={cn("flex-1", uiVariant === "form" ? "truncate" : "")}> 
            {date ? format(date, "dd/MM/yyyy", { locale: id }) : placeholder}
          </span>
          <CalendarIcon
            className={cn(
              "h-4 w-4",
              uiVariant === "form" ? "ml-2 opacity-70" : "mr-2 opacity-70"
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          initialFocus
          className="rounded-md border"
        />
      </PopoverContent>
    </Popover>
  )
}
