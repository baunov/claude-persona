import { select as inquirerSelect } from '@inquirer/prompts';

export interface SelectOption {
  label: string;
  value: string;
  description?: string;
}

/** Interactive radio-button selector using @inquirer/prompts */
export async function select(
  message: string,
  options: SelectOption[],
): Promise<string> {
  return inquirerSelect({
    message,
    choices: options.map((o) => ({
      name: o.label,
      value: o.value,
      description: o.description,
    })),
  });
}
