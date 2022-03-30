import {
  PrimaryKey,
  Property,
  ManyToOne,
  OneToMany,
  Collection,
  Enum,
  Entity
} from '@mikro-orm/core';
import { randomUUID } from 'crypto';
import { IngestError, IngestPhase } from '../../common/ingest.interfaces';
import { MediaFile } from '../media/media-file.entity';

/**
 * A bulk import session where multiple assets are imported
 **/
@Entity({ tableName: 'import_session' })
export class ImportSessionEntity {
  @PrimaryKey({ type: 'string' })
  id = randomUUID();

  /** Absolute path of the root file to import assets from */
  @Property({ type: 'string', nullable: false })
  basePath!: string;

  /** Assets imported by the session */
  @OneToMany(() => AssetImportEntity, (asset) => asset.session)
  assets = new Collection<AssetImportEntity>(this);

  @Enum({ type: () => IngestPhase, nullable: false, items: () => IngestPhase })
  phase!: IngestPhase;
}

/**
 * Track the progress of a single imported asset
 **/
@Entity({ tableName: 'asset_import' })
export class AssetImportEntity {
  @PrimaryKey({ type: 'string' })
  id = randomUUID();

  /** Unique and deterministic string representing the source of the ingested asset */
  @Property({ type: 'string', nullable: false })
  path!: string;

  /** Import session that this asset is managed by */
  @ManyToOne(() => ImportSessionEntity, {
    nullable: false,
    onDelete: 'cascade'
  })
  session!: ImportSessionEntity;

  /** Raw metadata discovered for the asset */
  @Property({ type: 'json' })
  metadata!: Record<string, unknown>;

  /** Imported media files associated with this asset */
  @OneToMany(() => FileImport, (file) => file.asset)
  files = new Collection<FileImport>(this);

  /** Imported media files associated with this asset */
  @Enum({ type: () => IngestPhase, nullable: false, items: () => IngestPhase })
  phase!: IngestPhase;
}

/**
 * Track the progress of a single imported media file.
 **/
@Entity({ tableName: 'file_import' })
export class FileImport {
  @PrimaryKey({ type: 'string' })
  id = randomUUID();

  /** Relative path from the session's `baseDir` to the source media file */
  @Property({ type: 'string', nullable: false })
  path!: string;

  /** The asset that will own this media file */
  @ManyToOne(() => AssetImportEntity, { nullable: false, onDelete: 'cascade' })
  asset!: AssetImportEntity;

  /**
   * Reference to the media media file being imported.
   *
   * This will not be defined until the media file has been copied into the archive.
   **/
  @ManyToOne(() => MediaFile, { nullable: true, onDelete: 'set null' })
  media?: MediaFile;

  /**
   * Any errors that occured importing this file.
   */
  @Enum({
    type: () => IngestError,
    nullable: true,
    items: () => IngestError
  })
  error?: IngestError;
}
