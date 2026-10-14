// CoreBrightness bridge adapted from Dim Keys (MIT); see THIRD_PARTY_NOTICES.md.
// A short-lived child owns each effect. EOF, timeout and signals restore the
// captured brightness; exiting also releases macOS's temporary manual override.
#import <Foundation/Foundation.h>
#import <dlfcn.h>
#import <poll.h>
#import <signal.h>
#import <fcntl.h>
#import <unistd.h>
#import <math.h>
#import <time.h>
@protocol KBC
- (NSArray *)copyKeyboardBacklightIDs;
- (BOOL)isKeyboardBuiltIn:(unsigned long long)kid;
- (BOOL)isAutoBrightnessEnabledForKeyboard:(unsigned long long)kid;
- (float)backlightLevelForKeyboard:(unsigned long long)kid;
- (BOOL)enableAutoBrightness:(BOOL)value forKeyboard:(unsigned long long)kid;
@end
@protocol BSC
- (id)copyPropertyForKey:(NSString *)key keyboardID:(unsigned long long)kid;
- (BOOL)setProperty:(id)value withKey:(NSString *)key keyboardID:(unsigned long long)kid;
@end
static volatile sig_atomic_t stopping=0;
static void stopSignal(int value){stopping=1;}
static double now(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return t.tv_sec+t.tv_nsec/1e9;}
static void output(id value){NSData *data=[NSJSONSerialization dataWithJSONObject:value options:0 error:nil];if(data){fwrite(data.bytes,1,data.length,stdout);putchar('\n');fflush(stdout);}}
static const NSString *key=@"KeyboardBacklightBrightness";
static double readBrightness(id<BSC> bsc,unsigned long long kid){id v=[bsc copyPropertyForKey:(NSString *)key keyboardID:kid];return [v isKindOfClass:NSNumber.class]?[v doubleValue]:NAN;}
int main(int argc,const char **argv){@autoreleasepool{
 BOOL probe=argc>1&&!strcmp(argv[1],"--probe"),test=argc>1&&!strcmp(argv[1],"--self-test");
 if(!probe&&!test&&(argc<2||strcmp(argv[1],"--serve"))){output(@{@"supported":@NO,@"reason":@"invalid-mode"});return 1;}
 if(!dlopen("/System/Library/PrivateFrameworks/CoreBrightness.framework/CoreBrightness",RTLD_NOW)){output(@{@"supported":@NO,@"reason":@"framework"});return 1;}
 id<KBC> kbc=[[NSClassFromString(@"KeyboardBrightnessClient") alloc]init];id<BSC> bsc=[[NSClassFromString(@"BrightnessSystemClient") alloc]init];
 for(NSString *sel in @[@"copyKeyboardBacklightIDs",@"isKeyboardBuiltIn:",@"isAutoBrightnessEnabledForKeyboard:",@"enableAutoBrightness:forKeyboard:"])
  if(![(id)kbc respondsToSelector:NSSelectorFromString(sel)]){output(@{@"supported":@NO,@"reason":@"interface"});return 1;}
 for(NSString *sel in @[@"copyPropertyForKey:keyboardID:",@"setProperty:withKey:keyboardID:"])
  if(![(id)bsc respondsToSelector:NSSelectorFromString(sel)]){output(@{@"supported":@NO,@"reason":@"interface"});return 1;}
 NSNumber *selected=nil;for(NSNumber *kid in [kbc copyKeyboardBacklightIDs])if([kbc isKeyboardBuiltIn:kid.unsignedLongLongValue]){selected=kid;break;}
 if(!selected){output(@{@"supported":@NO,@"reason":@"no-built-in-backlight"});return 1;}
 unsigned long long kid=selected.unsignedLongLongValue;double original=readBrightness(bsc,kid);
 if(!isfinite(original)||original<0||original>1){output(@{@"supported":@NO,@"reason":@"brightness"});return 1;}
 BOOL originalAuto=[kbc isAutoBrightnessEnabledForKeyboard:kid];
 output(@{@"type":@"ready",@"supported":@YES,@"keyboardID":selected,@"brightness":@(original),@"autoBrightness":@(originalAuto),@"hardwareLevel":([(id)kbc respondsToSelector:@selector(backlightLevelForKeyboard:)]?@([kbc backlightLevelForKeyboard:kid]):NSNull.null)});
 if(probe)return 0;
 signal(SIGTERM,stopSignal);signal(SIGINT,stopSignal);signal(SIGHUP,stopSignal);signal(SIGPIPE,SIG_IGN);
 fcntl(STDIN_FILENO,F_SETFL,fcntl(STDIN_FILENO,F_GETFL)|O_NONBLOCK);
 NSMutableData *input=[NSMutableData data];double start=now(),heartbeat=start,blinkStart=0,last=-1,low=1,high=0,maxError=0;
 BOOL active=test,touched=NO,received=test,failed=NO,testQueued=NO;int pending=0,flashes=0;NSString *lastMode=@"";
 while(!stopping){@autoreleasepool{
  double t=now(),elapsed=t-start;
  if(test){if(elapsed>=4&&!testQueued){testQueued=YES;pending=1;active=NO;}if(elapsed>=5.3)break;}
  else{
   struct pollfd fd={STDIN_FILENO,POLLIN|POLLHUP,0};int status=poll(&fd,1,50);
   if(status<0&&stopping)break;
   if(status>0){char buf[2048];ssize_t n=read(STDIN_FILENO,buf,sizeof(buf));
    if(n==0)break;
    if(n>0){[input appendBytes:buf length:n];if(input.length>8192){failed=YES;break;}
     while(YES){const unsigned char *bytes=input.bytes;NSUInteger i=0;while(i<input.length&&bytes[i]!='\n')i++;if(i==input.length)break;
      NSData *line=[input subdataWithRange:NSMakeRange(0,i)];[input replaceBytesInRange:NSMakeRange(0,i+1) withBytes:NULL length:0];
      id command=[NSJSONSerialization JSONObjectWithData:line options:0 error:nil];
      if(![command isKindOfClass:NSDictionary.class]){failed=YES;stopping=1;break;}
      if([command[@"stop"] boolValue]){stopping=1;break;}
      active=[command[@"active"] boolValue];pending+=MAX(0,MIN(32,[command[@"complete"] intValue]));heartbeat=now();received=YES;
     }
    }
   }
   if(now()-heartbeat>8)break;
  }
  if(stopping)break;t=now();
  if(pending&&blinkStart==0)blinkStart=t;
  if(blinkStart&&t-blinkStart>=.85){pending--;blinkStart=pending?t:0;}
  if(received&&!active&&!pending)break;
  if(!received)continue;
  NSString *mode=pending?@"flashing":@"breathing";
  if(![mode isEqualToString:lastMode]){output(@{@"type":@"mode",@"mode":mode});lastMode=mode;}
  double target;
  if(pending){double phase=t-blinkStart;target=(phase>=.10&&phase<.35)||(phase>=.50&&phase<.75)?1:0;}
  else{double peak=fmin(.75,fmax(.35,original*.85));target=.06+(peak-.06)*(.5-.5*cos(2*M_PI*(t-start)/3.6));}
  if(last<0||fabs(target-last)>.001){
   if(![bsc setProperty:@(target) withKey:(NSString *)key keyboardID:kid]){failed=YES;break;}
   touched=YES;if(target==1&&last!=1)flashes++;last=target;
   if(test){double actual=readBrightness(bsc,kid);low=fmin(low,actual);high=fmax(high,actual);maxError=fmax(maxError,fabs(target-actual));output(@{@"type":@"sample",@"at":@(t-start),@"target":@(target),@"actual":@(actual),@"hardwareLevel":([(id)kbc respondsToSelector:@selector(backlightLevelForKeyboard:)]?@([kbc backlightLevelForKeyboard:kid]):NSNull.null),@"mode":mode});}
  }
  if(test)usleep(50000);
 }}
 BOOL restored=YES;
 if(touched){restored=[bsc setProperty:@(original) withKey:(NSString *)key keyboardID:kid];
  // Restore a preference only if the write path actually changed it. Never
  // enable ambient adjustment unconditionally for users who disabled it.
  if([kbc isAutoBrightnessEnabledForKeyboard:kid]!=originalAuto)restored=[kbc enableAutoBrightness:originalAuto forKeyboard:kid]&&restored;
 }
 double final=readBrightness(bsc,kid);BOOL finalAuto=[kbc isAutoBrightnessEnabledForKeyboard:kid];
 output(@{@"type":@"restored",@"ok":@(restored&&isfinite(final)&&fabs(final-original)<.015&&originalAuto==finalAuto),@"brightness":@(final),@"autoBrightness":@(finalAuto),@"flashes":@(flashes),@"min":@(low),@"max":@(high),@"maxReadbackError":@(maxError)});
 return failed||!restored?1:0;
}}
