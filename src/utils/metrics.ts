
/**
 * Tiny Prometheus-style metrics registry with labeled histograms.
 * No deps; minimal implementation.
 */

type Labels = Record<string, string>;

function labelsKey(labels: Labels): string {
  const k = Object.keys(labels).sort();
  return k.map((kk) => kk + '=' + labels[kk]).join('|');
}
function renderLabels(labels: Labels): string {
  const parts = Object.keys(labels).sort().map(k => `${k}="${labels[k]}"`);
  return parts.length ? '{' + parts.join(',') + '}' : '';
}

export class LabeledHistogram {
  private readonly buckets: number[];
  private readonly name: string;
  private readonly help: string;
  // series key -> { counts per bucket + +Inf, sum, count, labels }
  private readonly series = new Map<string, { counts: number[]; sum: number; count: number; labels: Labels }>();

  constructor(name: string, help: string, buckets?: number[]) {
    this.name = name;
    this.help = help;
    // Default Prometheus buckets (seconds), slightly dense at low end
    this.buckets = buckets ?? [0.0005,0.001,0.0025,0.005,0.01,0.025,0.05,0.1,0.25,0.5,1,2.5,5];
  }

  observe(value: number, labels: Labels = {}) {
    const key = labelsKey(labels);
    let s = this.series.get(key);
    if (!s) {
      s = { counts: new Array(this.buckets.length + 1).fill(0), sum: 0, count: 0, labels };
      this.series.set(key, s);
    }
    let i = 0;
    while (i < this.buckets.length && value > this.buckets[i]) i++;
    s.counts[i]++;
    s.sum += value;
    s.count++;
  }

  export(): string {
    let out = '';
    out += `# HELP ${this.name} ${this.help}\n`;
    out += `# TYPE ${this.name} histogram\n`;
    for (const { counts, sum, count, labels } of this.series.values()) {
      // cumulative
      let cum = 0;
      for (let i = 0; i < this.buckets.length; i++) {
        cum += counts[i];
        const le = this.buckets[i];
        out += `${this.name}_bucket${renderLabels({ ...labels, le: String(le) })} ${cum}\n`;
      }
      cum += counts[this.buckets.length]; // +Inf bucket
      out += `${this.name}_bucket${renderLabels({ ...labels, le: '+Inf' })} ${cum}\n`;
      out += `${this.name}_sum${renderLabels(labels)} ${sum}\n`;
      out += `${this.name}_count${renderLabels(labels)} ${count}\n`;
    }
    return out;
  }
}

export const metrics = {
  httpDurations: new LabeledHistogram('zencache_http_seconds', 'HTTP request duration in seconds', undefined),
  respDurations: new LabeledHistogram('zencache_resp_seconds', 'RESP command duration in seconds', undefined),
};
