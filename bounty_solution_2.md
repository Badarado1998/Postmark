2. Code Patch / Fix

**File: `app/src/utils/csv.ts`** (New File)
```typescript
export interface BountyRow {
  id: string;
  status: string;
  repository: string;
  issueNumber: number | null;
  amount: number;
  challengeReward: number;
  deadline: string; // ISO 8601 UTC
  funder: string;
  payee: string;
}

export function buildCsv(rows: BountyRow[]): string {
  const headers = [
    'id',
    'status',
    'repository',
    'issueNumber',
    'amount',
    'challengeReward',
    'deadline',
    'funder',
    'payee'
  ];

  const escapeCsv = (value: string | number | null): string => {
    if (value === null) return '';
    const str = String(value);
    // Escape if contains quotes, commas, or newlines
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [headers.join(',')];
  
  for (const row of rows) {
    const values = [
      row.id,
      row.status,
      row.repository,
      row.issueNumber,
      row.amount,
      row.challengeReward,
      row.deadline,
      row.funder,
      row.payee
    ];
    lines.push(values.map(escapeCsv).join(','));
  }

  return lines.join('\n');
}
```

**File: `app/src/pages/Explore.tsx`** (Modified)
```typescript
// ... imports
import { buildCsv, BountyRow } from '../utils/csv';
// ...

export default function Explore() {
  // ... existing state and logic
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [filteredBounties, setFilteredBounties] = useState<Bounty[]>([]);
  // ... existing filter/sort logic

  const handleDownloadCsv = () => {
    // Map current filtered/sorted bounties to the CSV row structure
    const rows: BountyRow[] = filteredBounties.map(b => ({
      id: b.id,
      status: b.status,
      repository: b.repository,
      issueNumber: b.issueNumber,
      amount: b.amount,
      challengeReward: b.challengeReward,
      deadline: new Date(b.deadline).toISOString(),
      funder: b.funder,
      payee: