import type { ReactNode } from "react";

import { cn } from "../lib/utils";

interface JobListCardProps {
  title: ReactNode;
  badges?: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  tags?: ReactNode;
  aside?: ReactNode;
  footer?: ReactNode;
  leading?: ReactNode;
  className?: string;
}

export default function JobListCard({
  title,
  badges,
  subtitle,
  meta,
  tags,
  aside,
  footer,
  leading,
  className,
}: JobListCardProps) {
  return (
    <article className={cn("app-job-list-card group", className)}>
      <div className="flex items-start gap-4">
        {leading ? <div className="flex-shrink-0">{leading}</div> : null}

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                {title}
                {badges}
              </div>

              {subtitle ? <div className="text-sm text-gray-600 dark:text-white/60 mb-3">{subtitle}</div> : null}

              {meta ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600 dark:text-white/60 mb-4">
                  {meta}
                </div>
              ) : null}

              {tags ? <div className="flex flex-wrap gap-2">{tags}</div> : null}
            </div>

            {aside ? <div className="flex flex-col items-end gap-3 flex-shrink-0">{aside}</div> : null}
          </div>

          {footer ? <div className="mt-3 pt-3 border-t border-gray-200 dark:border-white/5">{footer}</div> : null}
        </div>
      </div>
    </article>
  );
}