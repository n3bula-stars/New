document.addEventListener("DOMContentLoaded", function () {
      setTimeout(() => {
        document.body.classList.add("loaded");
      }, 1000);
    });

    function startGaming() {
      window.location.href = "g.html";
    }

    let currentCarouselIndex = 0;
    let itemsPerView = 6;
    let touchStartX = 0;
    let touchEndX = 0;
    let isDragging = false;

    function initCarousel() {
      const container = document.querySelector('.carousel-container');
      const item = document.querySelector('.carousel-item');
      if (!container || !item) return;
      const gap = 8;
      const containerWidth = container.clientWidth;
      const itemWidth = item.clientWidth;
      itemsPerView = Math.floor(containerWidth / (itemWidth + gap));
      if (itemsPerView < 1) itemsPerView = 1;
      updateCarouselDots();
    }

    function moveCarousel(direction) {
      const track = document.querySelector('.carousel-track');
      const items = track.querySelectorAll('.carousel-item');
      const itemWidth = items[0].offsetWidth + 8;
      const maxIndex = Math.max(0, items.length - itemsPerView);
      currentCarouselIndex += direction;
      if (currentCarouselIndex < 0) currentCarouselIndex = 0;
      if (currentCarouselIndex > maxIndex) currentCarouselIndex = maxIndex;
      track.style.transform = `translateX(-${currentCarouselIndex * itemWidth}px)`;
      updateCarouselDots();
    }

    function updateCarouselDots() {
      const dots = document.getElementById('carouselDots');
      const items = document.querySelectorAll('.carousel-item');
      const maxIndex = Math.max(0, items.length - itemsPerView);
      const dotsCount = maxIndex + 1;
      dots.innerHTML = Array.from({ length: dotsCount }, (_, index) =>
        `<div class="carousel-dot ${index === currentCarouselIndex ? 'active' : ''}" onclick="goToCarouselSlide(${index})"></div>`
      ).join('');
    }

    function goToCarouselSlide(index) {
      currentCarouselIndex = index;
      moveCarousel(0);
    }

    function handleTouchStart(event) {
      touchStartX = event.touches[0].clientX;
      isDragging = true;
    }

    function handleTouchMove(event) {
      if (!isDragging) return;
      event.preventDefault();
      touchEndX = event.touches[0].clientX;
    }

    function handleTouchEnd() {
      if (!isDragging) return;
      isDragging = false;
      handleSwipe();
    }

    function handleMouseDown(event) {
      touchStartX = event.clientX;
      isDragging = true;
      event.preventDefault();
    }

    function handleMouseMove(event) {
      if (!isDragging) return;
      touchEndX = event.clientX;
    }

    function handleMouseUp() {
      if (!isDragging) return;
      isDragging = false;
      handleSwipe();
    }

    function handleSwipe() {
      const swipeThreshold = 50;
      const swipeDistance = touchStartX - touchEndX;
      if (Math.abs(swipeDistance) > swipeThreshold) {
        if (swipeDistance > 0) {
          moveCarousel(1);
        } else {
          moveCarousel(-1);
        }
      }
    }

    document.addEventListener("DOMContentLoaded", function () {
      const track = document.querySelector('.carousel-track');
      track.addEventListener('touchstart', handleTouchStart, { passive: true });
      track.addEventListener('touchmove', handleTouchMove, { passive: false });
      track.addEventListener('touchend', handleTouchEnd, { passive: true });
      track.addEventListener('mousedown', handleMouseDown);
      track.addEventListener('mousemove', handleMouseMove);
      track.addEventListener('mouseup', handleMouseUp);
      track.addEventListener('mouseleave', handleMouseUp);
      initCarousel();
    });

    window.addEventListener('resize', function () {
      clearTimeout(window.resizeTimer);
      window.resizeTimer = setTimeout(initCarousel, 200);
    });

    const images = [
      { src: "/storage/images/main/highway-racer.jpeg", caption: "Highway Racer" },
      {
        src: "/storage/images/main/buildnow.jpeg",
        caption: "Buildnow.gg",
      },
      { src: "/storage/ag/g/slope/IMG_5256.jpeg", caption: "Slope" },
      { src: "/storage/images/main/clash.jpeg", caption: "Clash Royale" },
      { src: "/storage/images/main/superstarcar.jpeg", caption: "Superstar Car" },
      { src: "/storage/ag/g/yohoho/IMG_5302.jpeg", caption: "YoHoHo!" },
    ];

    let currentIndex = 0;

    const imageElement = document.getElementById("large-image");
    const captionElement = document.getElementById("large-image-caption");

    function changeImage() {
      currentIndex = (currentIndex + 1) % images.length;
      const currentImage = images[currentIndex];
      imageElement.src = currentImage.src;
      captionElement.textContent = currentImage.caption;
    }

    setInterval(changeImage, 3000);

    class TxtType {
      constructor(el, toRotate, period) {
        this.toRotate = toRotate;
        this.el = el;
        this.loopNum = 0;
        this.period = parseInt(period, 10) || 2000;
        this.txt = "";
        this.tick();
        this.isDeleting = false;
      }

      tick() {
        const i = this.loopNum % this.toRotate.length;
        const fullTxt = this.toRotate[i];

        if (this.isDeleting) {
          this.txt = fullTxt.substring(0, this.txt.length - 1);
        } else {
          this.txt = fullTxt.substring(0, this.txt.length + 1);
        }

        this.el.innerHTML = '<span class="wrap">' + this.txt + "</span>";

        let delta = 200 - Math.random() * 100;

        if (this.isDeleting) {
          delta /= 2;
        }

        if (!this.isDeleting && this.txt === fullTxt) {
          delta = this.period;
          this.isDeleting = true;
        } else if (this.isDeleting && this.txt === "") {
          this.isDeleting = false;
          this.loopNum++;
          delta = 500;
        }

        setTimeout(() => this.tick(), delta);
      }
    }

    document.addEventListener("DOMContentLoaded", function () {
      const elements = document.getElementsByClassName("typewrite");
      for (let i = 0; i < elements.length; i++) {
        const toRotate = elements[i].getAttribute("data-type");
        const period = elements[i].getAttribute("data-period");
        if (toRotate) {
          new TxtType(elements[i], JSON.parse(toRotate), period);
        }
      }

      const css = document.createElement("style");
      css.type = "text/css";
      css.innerHTML =
        ".typewrite > .wrap { border-right: 0.06em solid #0096FF}";
      document.body.appendChild(css);
    });

    document.addEventListener("DOMContentLoaded", function () {
      const popup = document.getElementById("discord-popup");
      const closeBtn = document.getElementById("close-popup");

      function checkPopup() {
        const lastPopupClose = localStorage.getItem("lastPopupClose");
        const currentTime = new Date().getTime();

        if (!lastPopupClose || currentTime - lastPopupClose > 3600000) {
          popup.style.display = "flex";
        }
      }

      closeBtn.addEventListener("click", function () {
        popup.style.display = "none";
        localStorage.setItem("lastPopupClose", new Date().getTime());
      });

      checkPopup();
    });

    document.addEventListener("DOMContentLoaded", function () {
      const timeDisplay = document.getElementById("time-display");
      const batteryIcon = document.getElementById("battery-icon");
      const batteryPercentage = document.getElementById("battery-percentage");
      const fpsElement = document.getElementById("fps");
      let frameCount = 0;
      let lastUpdateTime = performance.now();

      function updateTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        timeDisplay.textContent = ` ${timeString}`;
      }

      function updateBattery() {
        if ("getBattery" in navigator) {
          navigator.getBattery().then(function (battery) {
            const level = battery.level * 100;
            const percentage = Math.round(level);

            batteryPercentage.textContent = `${percentage}%`;

            batteryIcon.className = "fas battery-icon";
            if (percentage >= 90) {
              batteryIcon.classList.add("fa-battery-full", "battery-full");
            } else if (percentage >= 70) {
              batteryIcon.classList.add(
                "fa-battery-three-quarters",
                "battery-good"
              );
            } else if (percentage >= 50) {
              batteryIcon.classList.add("fa-battery-half", "battery-good");
            } else if (percentage >= 30) {
              batteryIcon.classList.add(
                "fa-battery-quarter",
                "battery-medium"
              );
            } else if (percentage >= 10) {
              batteryIcon.classList.add("fa-battery-empty", "battery-low");
            } else {
              batteryIcon.classList.add("fa-battery-empty", "battery-low");
            }
          });
        } else {
          batteryPercentage.textContent = "n/a";
          batteryIcon.className = "fas fa-battery-slash battery-icon";
        }
      }

      function calculateFPS() {
        frameCount++;
        const now = performance.now();
        const deltaTime = now - lastUpdateTime;

        if (deltaTime >= 1000) {
          const fps = frameCount;
          fpsElement.textContent = `FPS: ${fps}`;
          frameCount = 0;
          lastUpdateTime = now;
        }
        requestAnimationFrame(calculateFPS);
      }

      updateTime();
      updateBattery();
      requestAnimationFrame(calculateFPS);

      setInterval(updateTime, 60000);
      setInterval(updateBattery, 30000);
    });