import { Badge } from "@/components/ui/badge";

/*
  Programmes show as chips. "Not sure yet, help us scope it" becomes an amber
  Unsure chip, since that inquiry still needs help choosing a programme.
*/
export function ProgramChip({ program }: { program: string }) {
  const unsure = /^not sure/i.test(program.trim());
  return <Badge variant={unsure ? "warning" : "neutral"} title={unsure ? program : undefined} className="h-auto min-h-5 whitespace-normal">
    {unsure ? "Unsure" : program}
  </Badge>;
}
