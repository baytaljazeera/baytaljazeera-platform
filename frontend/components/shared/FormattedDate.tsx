"use client";

import { formatDate, formatDateTime, formatRelativeTime } from "@/lib/utils";

type DateFormatType = "date" | "datetime" | "relative";

interface FormattedDateProps {
  date: string | null | undefined;
  format?: DateFormatType;
  className?: string;
}

export function FormattedDate({ date, format = "date", className = "" }: FormattedDateProps) {
  const formatted = 
    format === "datetime" ? formatDateTime(date) :
    format === "relative" ? formatRelativeTime(date) :
    formatDate(date);
  
  return <span className={className}>{formatted}</span>;
}

export default FormattedDate;
