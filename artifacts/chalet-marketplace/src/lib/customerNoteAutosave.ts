export type NoteSaveStatus = "saved" | "pending" | "saving" | "error";

/** Serialize writes so a slow earlier response cannot overwrite the latest draft. */
export class CustomerNoteAutosave {
  value: string;
  private savedValue: string;
  status: NoteSaveStatus = "saved";
  private timer?: ReturnType<typeof setTimeout>;
  private inFlight: Promise<void> | null = null;
  onChange?: () => void;

  constructor(initialValue: string, private save: (value: string) => Promise<void>, private delay = 600) {
    this.value = this.savedValue = initialValue;
  }

  get dirty() { return this.value !== this.savedValue; }

  change(value: string) {
    this.value = value;
    this.status = this.inFlight ? "saving" : this.dirty ? "pending" : "saved";
    this.onChange?.();
    clearTimeout(this.timer);
    if (this.dirty) this.timer = setTimeout(() => { void this.flush().catch(() => {}); }, this.delay);
  }

  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (!this.inFlight) {
      this.inFlight = this.drain().finally(() => { this.inFlight = null; });
    }
    return this.inFlight;
  }

  private async drain() {
    try {
      while (this.dirty) {
        const snapshot = this.value;
        this.status = "saving";
        this.onChange?.();
        await this.save(snapshot);
        this.savedValue = snapshot;
      }
      this.status = "saved";
      this.onChange?.();
    } catch (error) {
      clearTimeout(this.timer);
      this.status = "error";
      this.onChange?.();
      throw error;
    }
  }
}
