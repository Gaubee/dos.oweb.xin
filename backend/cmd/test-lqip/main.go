package main

import (
	"fmt"
	"github.com/gaubee/dos.oweb.xin/backend/internal/blobhash"
	_ "image/png"
)

func main() {
	lqip, err := blobhash.FromFile("frontend/public/covers/仙剑奇侠传/cover.png")
	if err != nil {
		fmt.Println("err:", err)
		return
	}
	fmt.Println("仙剑 lqip:", lqip)
	raw := lqip + (1 << 19)
	ca := (raw >> 18) & 3
	cb := (raw >> 16) & 3
	cc := (raw >> 14) & 3
	cd := (raw >> 12) & 3
	ce := (raw >> 10) & 3
	cf := (raw >> 8) & 3
	ll := (raw >> 6) & 3
	aaa := (raw >> 3) & 7
	bbb := raw & 7
	fmt.Printf("ca=%d cb=%d cc=%d cd=%d ce=%d cf=%d ll=%d aaa=%d bbb=%d\n", ca, cb, cc, cd, ce, cf, ll, aaa, bbb)
	fmt.Printf("\nCSS 解码验证:\n")
	fmt.Printf("  灰度 ca: hsl(0 0%% %.0f%%)\n", float64(ca)/3*60+20)
	fmt.Printf("  灰度 cf: hsl(0 0%% %.0f%%)\n", float64(cf)/3*60+20)
	fmt.Printf("  Oklab L=%.2f a=%.3f b=%.3f\n", float64(ll)/3*0.6+0.2, float64(aaa)/8*0.7-0.35, float64(bbb+1)/8*0.7-0.35)
}
