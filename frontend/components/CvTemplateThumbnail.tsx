import { cvTemplate, type CvTemplateId } from '../lib/cvTemplates';

type Props = {
  template: CvTemplateId;
  name: string;
  title: string;
  summaryLabel: string;
  experienceLabel: string;
  educationLabel: string;
};

const lineWidths = ['100%', '92%', '76%'];

export default function CvTemplateThumbnail({ template, name, title, summaryLabel, experienceLabel, educationLabel }: Props) {
  const style = cvTemplate(template);
  const isBand = style.header === 'band';
  const heading = (label: string) => <>
    <p className="mt-2 text-[5px] font-bold uppercase tracking-[0.12em]" style={{ color: style.accent }}>{label}</p>
    {style.rule ? <span className="mt-0.5 block h-px w-full" style={{ backgroundColor: style.accent }} /> : null}
  </>;
  const lines = (count: number) => <div className="mt-1 space-y-1">
    {lineWidths.slice(0, count).map((width, index) => <span key={width} className="block h-[2px] rounded-full bg-slate-300" style={{ width, opacity: 1 - index * 0.12 }} />)}
  </div>;

  return <div aria-hidden="true" className="relative mx-auto aspect-[210/297] w-full overflow-hidden rounded-[2px] bg-white text-slate-800 shadow-sm ring-1 ring-black/10">
    {style.header === 'panel' ? <span className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: style.accent }} /> : null}
    <header
      className={`px-3 py-3 ${style.headerAlign === 'center' ? 'text-center' : 'text-left'}`}
      style={{ backgroundColor: style.headerBackground ?? undefined, color: isBand ? '#ffffff' : style.accent }}
    >
      {style.header === 'dots' ? <div className="mb-1.5 flex gap-1">
        {[style.accent, '#d97757', '#9a9a70'].map(color => <span key={color} className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />)}
      </div> : null}
      <p className="truncate text-[10px] font-bold uppercase tracking-[0.08em]">{name}</p>
      <p className={`mt-0.5 truncate text-[5px] ${isBand ? 'text-white/85' : 'text-slate-600'}`}>{title}</p>
      <p className={`mt-1 truncate text-[4px] ${isBand ? 'text-white/70' : 'text-slate-400'}`}>Göteborg · namn@exempel.se</p>
    </header>
    <div className="px-3 py-2">
      {heading(summaryLabel)}{lines(3)}
      {heading(experienceLabel)}
      <p className="mt-1 text-[4.5px] font-semibold">Nordic Digital AB · 2023–nu</p>{lines(3)}
      <p className="mt-1.5 text-[4.5px] font-semibold">Teknikpartner AB · 2021–2023</p>{lines(2)}
      {heading(educationLabel)}
      <p className="mt-1 text-[4.5px] font-semibold">Systemutveckling, YH</p>{lines(2)}
    </div>
    {style.header === 'panel' ? <span className="absolute inset-x-0 bottom-0 h-1" style={{ backgroundColor: style.accent }} /> : null}
  </div>;
}
