/**
 * Base class for declarative Chrome events (e.g. declarativeContent.onPageChanged).
 * These events use rules instead of direct listener callbacks.
 */
export interface Rule {
  id?: string;
  tags?: string[];
  conditions: any[];
  actions: any[];
  priority?: number;
}

export type RuleCallback = (rules: Rule[]) => void;

export class DeclarativeEvent {
  private rules: Rule[] = [];

  /**
   * Registers rules to handle events.
   */
  addRules(rules: Rule[], callback?: RuleCallback): void {
    this.rules.push(...rules);
    if (callback) {
      callback(rules);
    }
  }

  /**
   * Unregisters rules.
   */
  removeRules(ruleIdentifiers?: string[], callback?: () => void): void {
    if (ruleIdentifiers) {
      this.rules = this.rules.filter(r => !r.id || !ruleIdentifiers.includes(r.id));
    } else {
      this.rules = [];
    }
    if (callback) {
      callback();
    }
  }

  /**
   * Returns currently registered rules.
   */
  getRules(ruleIdentifiers?: string[], callback?: RuleCallback): void {
    let result: Rule[];
    if (ruleIdentifiers) {
      result = this.rules.filter(r => r.id && ruleIdentifiers.includes(r.id));
    } else {
      result = [...this.rules];
    }
    if (callback) {
      callback(result);
    }
  }
}
