type InformationalContentProps = {
  content: string;
};

const headingPattern = /^(?:[١-٩٠-٩]+|[1-9]\d*)[.)-]\s+|^(?:مقدمة|تمهيد|أولاً|ثانياً|ثالثاً|رابعاً|خامساً|سادساً|سابعاً|ثامناً|تاسعاً|عاشراً)(?:\s|:|$)/;
const bulletPattern = /^(?:[-–—•▪◦*]|\d+[.)]|[١-٩٠-٩]+[.)])\s*/;

export function InformationalContent({ content }: InformationalContentProps) {
  const lines = content.split("\n").map(line => line.trim());

  return (
    <article className="rounded-2xl border border-border bg-card px-5 py-7 shadow-sm sm:px-8 sm:py-9 md:px-10 md:py-11">
      <div className="space-y-4 sm:space-y-5">
        {lines.map((line, lineIndex) => {
          if (!line) {
            return <div key={lineIndex} className="h-2 sm:h-3" aria-hidden="true" />;
          }

          const isListItem = bulletPattern.test(line);
          const isHeading =
            headingPattern.test(line) ||
            (line.length <= 60 && !/[.!؟،؛]$/.test(line));

          if (isHeading) {
            return (
              <h2
                key={lineIndex}
                className="border-r-4 border-primary py-0.5 pr-3 text-lg font-extrabold leading-8 text-foreground sm:text-xl"
              >
                {line}
              </h2>
            );
          }

          if (isListItem) {
            return (
              <div
                key={lineIndex}
                className="flex items-start gap-3 text-[15px] leading-8 text-foreground/90 sm:text-base sm:leading-9"
              >
                <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{line.replace(bulletPattern, "")}</span>
              </div>
            );
          }

          return (
            <p
              key={lineIndex}
              className="text-[15px] leading-8 text-foreground/90 sm:text-base sm:leading-9"
            >
              {line}
            </p>
          );
        })}
      </div>
    </article>
  );
}