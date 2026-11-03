import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

const SKELETON_ROWS = 5;

type SkeletonColumn = {
  label: string;
  className?: string;
};

/* A table with real headers and placeholder rows, shown while the rows load. */
export function TableSkeleton({ columns }: { columns: SkeletonColumn[] }) {
  return (
    <Table aria-hidden="true">
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column.label} className={column.className}>
              {column.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: SKELETON_ROWS }, (_, row) => (
          <TableRow key={row}>
            {columns.map((column) => (
              <TableCell key={column.label} className={column.className}>
                <Skeleton className="h-4 w-full max-w-32" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
