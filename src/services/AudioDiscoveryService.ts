/**
 * Audio Discovery Service
 *
 * Scans .codex files and extracts audio/text pairs for TTS training
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
    CodexFile,
    CodexCell,
    VerseAudio,
    AudioDiscoverySummary,
    AudioDiscoveryOptions,
    AudioAttachment
} from '../types/audio';

export class AudioDiscoveryService {
    private workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    /**
     * Discover all audio/text pairs from .codex files
     */
    async discoverAudio(options: AudioDiscoveryOptions = {}): Promise<AudioDiscoverySummary> {
        const baseDir = options.baseDir || './files/target';
        const basePath = path.join(this.workspaceRoot, baseDir);

        // Find all .codex files
        const codexFiles = await this.findCodexFiles(basePath);

        if (codexFiles.length === 0) {
            throw new Error(`No .codex files found in ${baseDir}`);
        }

        // Parse all .codex files and extract verses
        const allVerses: VerseAudio[] = [];
        const books = new Set<string>();
        const versesByBook = new Map<string, number>();
        const audioByBook = new Map<string, number>();

        for (const codexFilePath of codexFiles) {
            const verses = await this.parseCodexFile(codexFilePath, options);

            for (const verse of verses) {
                // Apply filters (only if verse has Bible reference data)
                if (verse.book) {
                    if (options.filterBooks && !options.filterBooks.includes(verse.book)) {
                        continue;
                    }

                    if (options.verseRange && !this.matchesVerseRange(verse, options.verseRange)) {
                        continue;
                    }

                    books.add(verse.book);

                    // Update counts
                    versesByBook.set(verse.book, (versesByBook.get(verse.book) || 0) + 1);
                    if (verse.hasAudio) {
                        audioByBook.set(verse.book, (audioByBook.get(verse.book) || 0) + 1);
                    }
                }

                allVerses.push(verse);
            }
        }

        // Sort verses by book, chapter, verse (verses without Bible refs go to end)
        allVerses.sort((a, b) => {
            // Verses without book info go to the end
            if (!a.book && !b.book) {return 0;}
            if (!a.book) {return 1;}
            if (!b.book) {return -1;}

            if (a.book !== b.book) {return a.book.localeCompare(b.book);}

            // Handle missing chapter/verse
            const aChapter = a.chapter ?? 0;
            const bChapter = b.chapter ?? 0;
            if (aChapter !== bChapter) {return aChapter - bChapter;}

            const aVerse = a.verse ?? 0;
            const bVerse = b.verse ?? 0;
            return aVerse - bVerse;
        });

        const versesWithAudio = allVerses.filter(v => v.hasAudio).length;

        return {
            totalVerses: allVerses.length,
            versesWithAudio,
            versesWithoutAudio: allVerses.length - versesWithAudio,
            verses: allVerses,
            books: Array.from(books).sort(),
            versesByBook,
            audioByBook
        };
    }

    /**
     * Find all .codex files in the specified directory
     */
    private async findCodexFiles(baseDir: string): Promise<string[]> {
        const codexFiles: string[] = [];

        try {
            await this.findCodexFilesRecursive(baseDir, codexFiles);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                throw new Error(`Directory not found: ${baseDir}`);
            }
            throw error;
        }

        return codexFiles;
    }

    /**
     * Recursively find .codex files
     */
    private async findCodexFilesRecursive(dir: string, results: string[]): Promise<void> {
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    await this.findCodexFilesRecursive(fullPath, results);
                } else if (entry.isFile() && entry.name.endsWith('.codex')) {
                    results.push(fullPath);
                }
            }
        } catch (error) {
            // Skip directories we can't read
            console.warn(`Could not read directory ${dir}:`, error);
        }
    }

    /**
     * Parse a single .codex file and extract verse audio information
     */
    private async parseCodexFile(filePath: string, options: AudioDiscoveryOptions): Promise<VerseAudio[]> {
        const verses: VerseAudio[] = [];

        try {
            // Read and parse the .codex file
            const content = await fs.readFile(filePath, 'utf-8');
            const codexData: CodexFile = JSON.parse(content);

            // Extract book name from filename (e.g., "JHN.codex" -> "JHN")
            const fileName = path.basename(filePath, '.codex');
            const book = fileName.toUpperCase();

            // Process each cell
            for (const cell of codexData.cells) {
                const verse = await this.extractVerseFromCell(cell, book, filePath, options);
                if (verse) {
                    verses.push(verse);
                }
            }
        } catch (error) {
            console.error(`Error parsing .codex file ${filePath}:`, error);
            throw new Error(`Failed to parse .codex file: ${filePath}`);
        }

        return verses;
    }

    /**
     * Parse a Bible reference string into its components
     * Format: "BOOK CHAPTER:VERSE[-VERSE]" (e.g., "JHN 1:1", "MAT 5:1-10")
     * Returns null if the reference cannot be parsed
     */
    private parseBibleReference(reference: string): {
        book: string;
        chapter: number;
        verse: number;
    } | null {
        const parts = reference.split(' ');
        if (parts.length !== 2) {
            return null;
        }

        const book = parts[0];
        const chapterVerse = parts[1];

        const cvParts = chapterVerse.split(':');
        if (cvParts.length !== 2) {
            return null;
        }

        const chapter = parseInt(cvParts[0], 10);
        const verseParts = cvParts[1].split('-');
        const verse = parseInt(verseParts[0], 10);

        if (isNaN(chapter) || isNaN(verse)) {
            return null;
        }

        return { book, chapter, verse };
    }

    /**
     * Extract verse information from a .codex cell
     */
    private async extractVerseFromCell(
        cell: CodexCell,
        book: string,
        codexFilePath: string,
        options: AudioDiscoveryOptions
    ): Promise<VerseAudio | null> {
        // Only process text cells
        if (cell.metadata.type !== 'text') {
            return null;
        }

        const cellId = cell.metadata.id;

        // Determine where to find the Bible reference
        // Old format: ID contains the Bible reference (has a colon, e.g., "JHN 1:1")
        // New format: ID is alphanumeric (UUID), Bible reference is in data.globalReferences
        let bibleRefString: string | undefined;

        if (cellId.includes(':')) {
            // Old format: ID is the Bible reference
            bibleRefString = cellId;
        } else {
            // New format: Check data.globalReferences
            if (cell.metadata.data?.globalReferences && cell.metadata.data.globalReferences.length > 0) {
                bibleRefString = cell.metadata.data.globalReferences[0];
            }
        }

        // Parse the Bible reference if we found one
        let parsedRef: { book: string; chapter: number; verse: number } | null = null;
        if (bibleRefString) {
            parsedRef = this.parseBibleReference(bibleRefString);
            if (!parsedRef) {
                console.warn(`Could not parse Bible reference: ${bibleRefString}`);
            }
        }

        // Check for audio
        let hasAudio = false;
        let hasLocalAudio = false;
        let audioPath: string | undefined;
        let audioId: string | undefined;

        if (cell.metadata.attachments && cell.metadata.selectedAudioId) {
            const selectedAudio = cell.metadata.attachments[cell.metadata.selectedAudioId];

            if (selectedAudio && !selectedAudio.isDeleted) {
                audioId = cell.metadata.selectedAudioId;

                // The URL in the .codex file is relative to the project root
                // e.g., ".project/attachments/files/JHN/audio-xxx.webm"
                const relativeAudioPath = selectedAudio.url;

                // Convert to absolute path for the files/ folder
                const absoluteFilesPath = path.join(
                    path.dirname(codexFilePath),
                    '..',
                    '..',
                    relativeAudioPath
                );

                // Build the corresponding pointers/ path
                const absolutePointersPath = absoluteFilesPath.replace(
                    `${path.sep}.project${path.sep}attachments${path.sep}files${path.sep}`,
                    `${path.sep}.project${path.sep}attachments${path.sep}pointers${path.sep}`
                );

                // Validate file exists if requested
                if (options.validateFiles) {
                    // Check files/ folder (actual local audio)
                    let filesExists = false;
                    try {
                        await fs.access(absoluteFilesPath);
                        filesExists = true;
                    } catch {
                        // File doesn't exist in files/
                    }

                    // Check pointers/ folder (LFS pointer)
                    let pointersExists = false;
                    try {
                        await fs.access(absolutePointersPath);
                        pointersExists = true;
                    } catch {
                        // File doesn't exist in pointers/
                    }

                    // Audio exists if it's in either location
                    hasAudio = filesExists || pointersExists;
                    // Local audio only if actual file is in files/ folder
                    hasLocalAudio = filesExists;
                    if (hasAudio) {
                        audioPath = relativeAudioPath;
                    }
                } else {
                    // Assume it exists based on metadata
                    hasAudio = true;
                    hasLocalAudio = false; // Unknown without validation
                    audioPath = relativeAudioPath;
                }
            }
        }

        return {
            cellId,
            verseRef: bibleRefString,
            book: parsedRef?.book,
            chapter: parsedRef?.chapter,
            verse: parsedRef?.verse,
            text: cell.value,
            hasAudio,
            hasLocalAudio,
            audioPath,
            audioId
        };
    }

    /**
     * Check if a verse matches the specified verse range
     * Only works for verses with Bible reference data
     */
    private matchesVerseRange(
        verse: VerseAudio,
        range: NonNullable<AudioDiscoveryOptions['verseRange']>
    ): boolean {
        // Can't match range if verse doesn't have Bible reference data
        if (!verse.book || verse.chapter === undefined || verse.verse === undefined) {
            return false;
        }

        if (verse.book !== range.book) {
            return false;
        }

        if (range.startChapter !== undefined && verse.chapter < range.startChapter) {
            return false;
        }

        if (range.endChapter !== undefined && verse.chapter > range.endChapter) {
            return false;
        }

        // If we're in the start chapter, check start verse
        if (range.startChapter !== undefined &&
            verse.chapter === range.startChapter &&
            range.startVerse !== undefined &&
            verse.verse < range.startVerse) {
            return false;
        }

        // If we're in the end chapter, check end verse
        if (range.endChapter !== undefined &&
            verse.chapter === range.endChapter &&
            range.endVerse !== undefined &&
            verse.verse > range.endVerse) {
            return false;
        }

        return true;
    }

    /**
     * Get a summary of missing audio for a specific book
     */
    async getMissingAudio(book: string): Promise<VerseAudio[]> {
        const summary = await this.discoverAudio({ filterBooks: [book] });
        return summary.verses.filter(v => !v.hasAudio);
    }

    /**
     * Get verses with audio for a specific book and chapter range
     */
    async getVersesWithAudio(
        book: string,
        startChapter?: number,
        endChapter?: number
    ): Promise<VerseAudio[]> {
        const summary = await this.discoverAudio({
            filterBooks: [book],
            verseRange: {
                book,
                startChapter,
                endChapter
            }
        });
        return summary.verses.filter(v => v.hasAudio);
    }

    /**
     * Validate audio sufficiency for training
     * Returns true if there are enough audio samples
     */
    validateAudioSufficiency(summary: AudioDiscoverySummary, minSamples: number = 10): {
        sufficient: boolean;
        count: number;
        required: number;
        message: string;
    } {
        const count = summary.versesWithAudio;
        const sufficient = count >= minSamples;

        return {
            sufficient,
            count,
            required: minSamples,
            message: sufficient
                ? `Found ${count} audio samples (minimum ${minSamples} required)`
                : `Insufficient audio: found ${count}, need at least ${minSamples} samples`
        };
    }
}