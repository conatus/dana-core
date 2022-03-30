/** @jsxImportSource theme-ui */

import { ProgressIndicator, ProgressValue } from './atoms.component';
import { DataGridCell } from './grid.component';

/** Datagrid cell for free text */
export const TextCell: DataGridCell<string> = ({ value }) => <>{value}</>;

/** Datagrid cell for indicating progress */
export const ProgressCell: DataGridCell<ProgressValue> = ({ value }) => (
  <div sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
    <ProgressIndicator value={value} />
  </div>
);