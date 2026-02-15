import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, FileText, Smartphone, Monitor, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

interface CaptionWord {
    word: string;
    start: number;
    end: number;
}

interface CaptionSegment {
    start: number;
    end: number;
    text: string;
    words: CaptionWord[];
}

interface VideoPlayerProps {
    videoUrl: string | null;
    captionsJson: CaptionSegment[] | null;
    wordTimestamps: any | null;
    fallbackCaptionText?: string;
    className?: string;
}

type AspectRatio = '9/16' | '1/1' | '16/9';
type CaptionStyle = 'default' | 'bounce' | 'pop' | 'fade';

const OVERLAP_MS = 150; // ms to keep previous caption visible for crossfade

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
    videoUrl,
    captionsJson,
    wordTimestamps,
    fallbackCaptionText,
    className
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [showCaptions, setShowCaptions] = useState(true);
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9/16');
    const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('bounce');
    const [activeIndex, setActiveIndex] = useState<number>(-1);
    const [prevIndex, setPrevIndex] = useState<number>(-1);
    const [showControls, setShowControls] = useState(true);
    const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Debug: log caption load
    useEffect(() => {
        if (captionsJson && Array.isArray(captionsJson)) {
            console.log(`[captions] loaded segments = ${captionsJson.length}`);
        }
    }, [captionsJson]);

    // ── Caption sync: find active segment by currentTime ──
    useEffect(() => {
        if (!captionsJson || !Array.isArray(captionsJson) || captionsJson.length === 0) {
            setActiveIndex(-1);
            return;
        }

        const idx = captionsJson.findIndex(
            (c) => currentTime >= c.start && currentTime <= c.end
        );

        if (idx !== activeIndex) {
            // Crossfade: keep previous visible briefly
            if (activeIndex >= 0 && idx >= 0) {
                setPrevIndex(activeIndex);
                setTimeout(() => setPrevIndex(-1), OVERLAP_MS);
            }
            setActiveIndex(idx);
            console.log(`[captions] currentTime = ${currentTime.toFixed(2)} activeIndex = ${idx}`);
        }
    }, [currentTime, captionsJson, activeIndex]);

    const activeCaption: CaptionSegment | null = useMemo(() => {
        if (!captionsJson || activeIndex < 0) return null;
        return captionsJson[activeIndex] ?? null;
    }, [captionsJson, activeIndex]);

    // ── Video event handlers ──
    const handleTimeUpdate = useCallback(() => {
        if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
    }, []);

    const handleLoadedMetadata = useCallback(() => {
        if (videoRef.current) setDuration(videoRef.current.duration);
    }, []);

    const handleEnded = useCallback(() => setIsPlaying(false), []);

    const togglePlay = useCallback(() => {
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
            } else {
                videoRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    }, [isPlaying]);

    const handleSeek = useCallback((value: number[]) => {
        if (videoRef.current) {
            videoRef.current.currentTime = value[0];
            setCurrentTime(value[0]);
        }
    }, []);

    const toggleMute = useCallback(() => {
        if (videoRef.current) {
            videoRef.current.muted = !isMuted;
            setIsMuted(!isMuted);
        }
    }, [isMuted]);

    const toggleFullscreen = useCallback(() => {
        if (videoRef.current) {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                videoRef.current.parentElement?.requestFullscreen();
            }
        }
    }, []);

    // Auto-hide controls after 3s of inactivity
    const resetControlsTimer = useCallback(() => {
        setShowControls(true);
        if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
        controlsTimeout.current = setTimeout(() => setShowControls(false), 3000);
    }, []);

    // ── Render caption text with karaoke highlighting ──
    const renderKaraokeWords = (caption: CaptionSegment) => {
        if (!caption.words || caption.words.length === 0) {
            return <span>{caption.text}</span>;
        }

        return caption.words.map((w, idx) => {
            const isActive = currentTime >= w.start && currentTime <= w.end;
            const isPast = currentTime > w.end;

            return (
                <span
                    key={`${caption.start}-${idx}`}
                    className={cn(
                        "inline-block mx-0.5 transition-all duration-150 ease-out",
                        isActive && "text-yellow-300 scale-110 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]",
                        isPast && "text-white",
                        !isActive && !isPast && "text-white/50"
                    )}
                    style={isActive ? { transform: 'scale(1.12)' } : undefined}
                >
                    {w.word}
                </span>
            );
        });
    };

    // ── Animation class based on style ──
    const getAnimationClass = (style: CaptionStyle) => {
        switch (style) {
            case 'bounce': return 'animate-bounce-subtle';
            case 'pop': return 'animate-pop-in';
            case 'fade': return 'animate-fade-in';
            default: return 'animate-fade-in';
        }
    };

    // Format time for display
    const formatTime = (t: number) => {
        const m = Math.floor(t / 60);
        const s = Math.floor(t % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className={cn("flex flex-col gap-4", className)}>
            {/* Aspect Ratio Switcher */}
            <div className="flex justify-center gap-2 mb-2">
                <Button variant={aspectRatio === '9/16' ? "default" : "outline"} size="sm" onClick={() => setAspectRatio('9/16')}>
                    <Smartphone className="w-4 h-4 mr-1" /> 9:16
                </Button>
                <Button variant={aspectRatio === '1/1' ? "default" : "outline"} size="sm" onClick={() => setAspectRatio('1/1')}>
                    <Square className="w-4 h-4 mr-1" /> 1:1
                </Button>
                <Button variant={aspectRatio === '16/9' ? "default" : "outline"} size="sm" onClick={() => setAspectRatio('16/9')}>
                    <Monitor className="w-4 h-4 mr-1" /> 16:9
                </Button>
            </div>

            {/* Phone Frame Container */}
            <div
                className="relative mx-auto bg-black rounded-3xl overflow-hidden shadow-2xl border-8 border-gray-900 group"
                style={{
                    aspectRatio: aspectRatio === '9/16' ? '9/16' : aspectRatio === '1/1' ? '1/1' : '16/9',
                    maxHeight: '80vh',
                    width: aspectRatio === '16/9' ? '100%' : 'auto',
                    maxWidth: aspectRatio === '16/9' ? '900px' : '400px'
                }}
                onMouseMove={resetControlsTimer}
                onTouchStart={resetControlsTimer}
            >
                {videoUrl ? (
                    <video
                        ref={videoRef}
                        src={videoUrl}
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={togglePlay}
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={handleLoadedMetadata}
                        onEnded={handleEnded}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-900 text-gray-500">
                        No Video Source
                    </div>
                )}

                {/* ── CAPTION OVERLAY ── */}
                {showCaptions && (
                    <div className="absolute bottom-16 left-0 right-0 px-4 text-center pointer-events-none z-10">
                        {/* Active caption */}
                        {activeCaption ? (
                            <div
                                key={`caption-${activeIndex}`}
                                className={cn(
                                    "inline-block max-w-[85%] bg-black/70 backdrop-blur-md px-5 py-3 rounded-2xl",
                                    "text-white font-bold text-lg md:text-xl leading-relaxed",
                                    "shadow-lg border border-white/10",
                                    getAnimationClass(captionStyle)
                                )}
                            >
                                {renderKaraokeWords(activeCaption)}
                            </div>
                        ) : fallbackCaptionText ? (
                            /* FALLBACK: static caption text if no timestamped data */
                            <div className="inline-block max-w-[85%] bg-black/70 backdrop-blur-md px-5 py-3 rounded-2xl text-white font-bold text-lg opacity-60">
                                {fallbackCaptionText}
                            </div>
                        ) : null}

                        {/* Previous caption fading out (crossfade overlap) */}
                        {prevIndex >= 0 && captionsJson && captionsJson[prevIndex] && (
                            <div className="absolute inset-0 flex items-end justify-center px-4 pb-0 pointer-events-none">
                                <div className="inline-block max-w-[85%] bg-black/70 backdrop-blur-md px-5 py-3 rounded-2xl text-white font-bold text-lg md:text-xl opacity-0 transition-opacity duration-150">
                                    {captionsJson[prevIndex].text}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── CONTROLS OVERLAY ── */}
                <div className={cn(
                    "absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent transition-opacity duration-300",
                    showControls || !isPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}>
                    <div className="flex flex-col gap-2">
                        <Slider
                            value={[currentTime]}
                            max={duration || 1}
                            step={0.1}
                            onValueChange={handleSeek}
                            className="w-full"
                        />

                        <div className="flex items-center justify-between text-white">
                            <div className="flex items-center gap-2">
                                <Button variant="ghost" size="icon" onClick={togglePlay} className="h-8 w-8 text-white hover:bg-white/20">
                                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                                </Button>

                                <span className="text-xs font-mono">
                                    {formatTime(currentTime)} / {formatTime(duration)}
                                </span>
                            </div>

                            <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" onClick={() => setShowCaptions(!showCaptions)} className={cn("h-8 w-8 hover:bg-white/20", showCaptions ? "text-yellow-400" : "text-white/60")}>
                                    <FileText className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={toggleMute} className="h-8 w-8 text-white hover:bg-white/20">
                                    {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                                </Button>
                                <Button variant="ghost" size="icon" onClick={toggleFullscreen} className="h-8 w-8 text-white hover:bg-white/20">
                                    <Maximize className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Caption Style Selector */}
            <div className="flex justify-center gap-2 mt-2">
                <span className="text-xs text-muted-foreground self-center mr-2 uppercase tracking-wider">Style:</span>
                {(['default', 'bounce', 'pop', 'fade'] as CaptionStyle[]).map((s) => (
                    <Button
                        key={s}
                        variant={captionStyle === s ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setCaptionStyle(s)}
                        className="text-xs capitalize"
                    >
                        {s}
                    </Button>
                ))}
            </div>
        </div>
    );
};
