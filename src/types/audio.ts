/**
 * Audio Discovery Types
 *
 * Types for parsing .codex files and extracting audio/text pairs
 */

/**
 * Represents an audio attachment in a .codex file
 */
export interface AudioAttachment {
    url: string;
    type: string;
    createdAt: number;
    updatedAt: number;
    isDeleted: boolean;
}

/**
 * Represents the metadata of a .codex cell
 */
export interface CodexCellMetadata {
    type: string;
    id: string;  // Can be either Bible reference (e.g., "JHN 1:1") or alphanumeric ID (e.g., UUID)
    data: {
        globalReferences?: string[];  // Bible references (e.g., ["OBA 1:1"])
        [key: string]: any;
    };
    cellLabel: string;
    attachments?: Record<string, AudioAttachment>;
    selectedAudioId?: string;
    selectionTimestamp?: number;
    edits?: any[];
}

/**
 * Represents a cell in a .codex file
 */
export interface CodexCell {
    kind: number;
    languageId: string;
    value: string;
    metadata: CodexCellMetadata;
}

/**
 * Represents the structure of a .codex file
 */
export interface CodexFile {
    cells: CodexCell[];
}

/**
 * Represents a verse with its audio information
 */
export interface VerseAudio {
    /** Cell ID (can be Bible reference like "JHN 1:1" or alphanumeric ID like UUID) */
    cellId: string;
    /** Bible verse reference (e.g., "JHN 1:1") - optional for non-Bible projects */
    verseRef?: string;
    /** Book code (e.g., "JHN") - optional for non-Bible projects */
    book?: string;
    /** Chapter number - optional for non-Bible projects */
    chapter?: number;
    /** Verse number - optional for non-Bible projects */
    verse?: number;
    /** Verse text content */
    text: string;
    /** Whether this verse has valid audio */
    hasAudio: boolean;
    /** Path to the audio file (relative to project root) */
    audioPath?: string;
    /** Selected audio ID */
    audioId?: string;
}

/**
 * Summary of audio discovery results
 */
export interface AudioDiscoverySummary {
    /** Total number of verses found */
    totalVerses: number;
    /** Number of verses with valid audio */
    versesWithAudio: number;
    /** Number of verses without audio */
    versesWithoutAudio: number;
    /** List of all verses with their audio status */
    verses: VerseAudio[];
    /** List of books found */
    books: string[];
    /** Mapping of book -> verse count */
    versesByBook: Map<string, number>;
    /** Mapping of book -> audio count */
    audioByBook: Map<string, number>;
}

/**
 * Options for audio discovery
 */
export interface AudioDiscoveryOptions {
    /** Base directory to search for .codex files (default: "./files/target") */
    baseDir?: string;
    /** Whether to validate that audio files actually exist on disk */
    validateFiles?: boolean;
    /** Filter by specific books (e.g., ["JHN", "MAT"]) */
    filterBooks?: string[];
    /** Filter by verse range (e.g., { book: "JHN", startChapter: 1, endChapter: 3 }) */
    verseRange?: {
        book: string;
        startChapter?: number;
        endChapter?: number;
        startVerse?: number;
        endVerse?: number;
    };
}