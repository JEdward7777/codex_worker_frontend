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
                // Apply filters
                if (options.filterBooks && !options.filterBooks.includes(verse.book)) {
                    continue;
                }

                if (options.verseRange && !this.matchesVerseRange(verse, options.verseRange)) {
                    continue;
                }

                allVerses.push(verse);
                books.add(verse.book);

                // Update counts
                versesByBook.set(verse.book, (versesByBook.get(verse.book) || 0) + 1);
                if (verse.hasAudio) {
                    audioByBook.set(verse.book, (audioByBook.get(verse.book) || 0) + 1);
                }
            }
        }

        // Sort verses by book, chapter, verse
        allVerses.sort((a, b) => {
            if (a.book !== b.book) return a.book.localeCompare(b.book);
            if (a.chapter !== b.chapter) return a.chapter - b.chapter;
            return a.verse - b.verse;
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

        // Parse verse reference (e.g., "JHN 1:1", "1CH 2:3", "MAT 5:1-2")
        // Format: BOOK CHAPTER:VERSE[-VERSE]
        const verseRef = cell.metadata.id;
        
        // Split by space to get book and chapter:verse
        const parts = verseRef.split(' ');
        if (parts.length !== 2) {
            console.warn(`Invalid verse reference format (expected 'BOOK CHAPTER:VERSE'): ${verseRef}`);
            return null;
        }

        const refBook = parts[0];
        const chapterVerse = parts[1];

        // Split by colon to get chapter and verse
        const cvParts = chapterVerse.split(':');
        if (cvParts.length !== 2) {
            console.warn(`Invalid chapter:verse format: ${chapterVerse}`);
            return null;
        }

        const chapterStr = cvParts[0];
        const verseStr = cvParts[1];

        // Parse chapter
        const chapter = parseInt(chapterStr, 10);
        if (isNaN(chapter)) {
            console.warn(`Invalid chapter number: ${chapterStr}`);
            return null;
        }

        // Parse verse (may be a range like "1-2", we'll take the first verse)
        // For verse ranges, we store the first verse number
        const verseParts = verseStr.split('-');
        const verse = parseInt(verseParts[0], 10);
        if (isNaN(verse)) {
            console.warn(`Invalid verse number: ${verseStr}`);
            return null;
        }

        // Check for audio
        let hasAudio = false;
        let audioPath: string | undefined;
        let audioId: string | undefined;

        if (cell.metadata.attachments && cell.metadata.selectedAudioId) {
            const selectedAudio = cell.metadata.attachments[cell.metadata.selectedAudioId];
            
            if (selectedAudio && !selectedAudio.isDeleted) {
                audioId = cell.metadata.selectedAudioId;
                
                // The URL in the .codex file is relative to the project root
                // e.g., ".project/attachments/files/JHN/audio-xxx.webm"
                const relativeAudioPath = selectedAudio.url;
                
                // Convert to absolute path
                const absoluteAudioPath = path.join(
                    path.dirname(codexFilePath),
                    '..',
                    '..',
                    relativeAudioPath
                );

                // Validate file exists if requested
                if (options.validateFiles) {
                    try {
                        await fs.access(absoluteAudioPath);
                        hasAudio = true;
                        audioPath = relativeAudioPath;
                    } catch {
                        // File doesn't exist
                        hasAudio = false;
                    }
                } else {
                    // Assume it exists
                    hasAudio = true;
                    audioPath = relativeAudioPath;
                }
            }
        }

        return {
            verseRef,
            book: refBook,
            chapter,
            verse,
            text: cell.value,
            hasAudio,
            audioPath,
            audioId
        };
    }

    /**
     * Check if a verse matches the specified verse range
     */
    private matchesVerseRange(
        verse: VerseAudio,
        range: NonNullable<AudioDiscoveryOptions['verseRange']>
    ): boolean {
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