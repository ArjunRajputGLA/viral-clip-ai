
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, FileText, Smartphone, Monitor, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import type { Tables } from '@/integrations/supabase/types';

interface VideoPlayerProps {
    videoUrl: string | null;
    captionsJson: any | null; // The new 3-6 word groupings
    wordTimestamps: any | null; // The raw word timestamps
    className?: string;
}

type AspectRatio = '9/16' | '1/1' | '16/9';
type CaptionStyle = 'default' | 'bounce' | 'pop' | 'fade';

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ videoUrl, captionsJson, wordTimestamps, className }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [showCaptions, setShowCaptions] = useState(true);
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9/16');
    const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('bounce');

    // Sync state with video
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleTimeUpdate = () => setCurrentTime(video.currentTime);
        const handleLoadedMetadata = () => setDuration(video.duration);
        const handleEnded = () => setIsPlaying(false);

        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        video.addEventListener('ended', handleEnded);

        return () => {
            video.removeEventListener('timeupdate', handleTimeUpdate);
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
            video.removeEventListener('ended', handleEnded);
        };
    }, []);

    const togglePlay = () => {
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
            } else {
                videoRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    const handleSeek = (value: number[]) => {
        if (videoRef.current) {
            videoRef.current.currentTime = value[0];
            setCurrentTime(value[0]);
        }
    };

    const toggleMute = () => {
        if (videoRef.current) {
            videoRef.current.muted = !isMuted;
            setIsMuted(!isMuted);
        }
    };

    const toggleFullscreen = () => {
        if (videoRef.current) {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                videoRef.current.parentElement?.requestFullscreen();
            }
        }
    };

    // Find active caption segment
    const activeCaption = useMemo(() => {
        if (!captionsJson || !Array.isArray(captionsJson)) return null;
        return captionsJson.find((c: any) => currentTime >= c.start && currentTime <= c.end);
    }, [captionsJson, currentTime]);

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
            <div className="relative mx-auto bg-black rounded-3xl overflow-hidden shadow-2xl border-8 border-gray-900"
                style={{
                    aspectRatio: aspectRatio === '9/16' ? '9/16' : aspectRatio === '1/1' ? '1/1' : '16/9',
                    maxHeight: '80vh',
                    width: aspectRatio === '16/9' ? '100%' : 'auto',
                    maxWidth: aspectRatio === '16/9' ? '900px' : '400px'
                }}
            >
                {videoUrl ? (
                    <video
                        ref={videoRef}
                        src={videoUrl}
                        className="w-full h-full object-cover"
                        onClick={togglePlay}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-900 text-gray-500">
                        No Video Source
                    </div>
                )}

                {/* Captions Overlay */}
                {showCaptions && activeCaption && (
                    <div className="absolute bottom-20 left-0 right-0 px-6 text-center pointer-events-none">
                        <div className={cn(
                            "inline-block bg-black/60 backdrop-blur-sm px-4 py-2 rounded-xl text-white font-bold text-lg md:text-xl transition-all duration-200",
                            captionStyle === 'bounce' && "animate-bounce-subtle",
                            captionStyle === 'pop' && "animate-pop-in",
                            captionStyle === 'fade' && "animate-fade-in"
                        )}>
                            {activeCaption.words?.map((wordObj: any, idx: number) => {
                                const isActive = currentTime >= wordObj.start && currentTime <= wordObj.end;
                                const isPast = currentTime > wordObj.end;

                                return (
                                    <span key={idx} className={cn(
                                        "mx-1 transition-colors duration-150",
                                        isActive ? "text-yellow-400 scale-110 inline-block" : isPast ? "text-white" : "text-white/60"
                                    )}>
                                        {wordObj.word}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Custom Controls Overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300 opacity-0 hover:opacity-100 peer-hover:opacity-100">
                    <div className="flex flex-col gap-2">
                        <Slider
                            value={[currentTime]}
                            max={duration}
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
                                    {Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, '0')} /
                                    {Math.floor(duration / 60)}:{Math.floor(duration % 60).toString().padStart(2, '0')}
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                <Button variant="ghost" size="icon" onClick={() => setShowCaptions(!showCaptions)} className={cn("h-8 w-8 hover:bg-white/20", showCaptions ? "text-yellow-400" : "text-white")}>
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
            <div className="flex justify-center gap-2 mt-4">
                <span className="text-sm text-muted-foreground self-center mr-2">Caption Style:</span>
                <Button variant={captionStyle === 'default' ? "secondary" : "ghost"} size="sm" onClick={() => setCaptionStyle('default')}>Default</Button>
                <Button variant={captionStyle === 'bounce' ? "secondary" : "ghost"} size="sm" onClick={() => setCaptionStyle('bounce')}>Bounce</Button>
                <Button variant={captionStyle === 'pop' ? "secondary" : "ghost"} size="sm" onClick={() => setCaptionStyle('pop')}>Pop</Button>
                <Button variant={captionStyle === 'fade' ? "secondary" : "ghost"} size="sm" onClick={() => setCaptionStyle('fade')}>Fade</Button>
            </div>
        </div>
    );
};
