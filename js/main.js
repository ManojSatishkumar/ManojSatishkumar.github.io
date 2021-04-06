/*global $, jQuery, alert*/
$(document).ready(function () {
  "use strict";

  // ========================================================================= //
  //  //SMOOTH SCROLL
  // ========================================================================= //

  $(document).on("scroll", onScroll);

  $('a[href^="#"]').on("click", function (e) {
    e.preventDefault();
    $(document).off("scroll");

    $("a").each(function () {
      $(this).removeClass("active");
      if ($(window).width() < 768) {
        $(".nav-menu").slideUp();
      }
    });

    $(this).addClass("active");

    var target = this.hash,
      menu = target;

    target = $(target);
    $("html, body")
      .stop()
      .animate(
        {
          scrollTop: target.offset().top - 80,
        },
        500,
        "swing",
        function () {
          window.location.hash = target.selector;
          $(document).on("scroll", onScroll);
        }
      );
  });

  function onScroll(event) {
    if ($(".home").length) {
      var scrollPos = $(document).scrollTop();
      $("nav ul li a").each(function () {
        var currLink = $(this);
        var refElement = $(currLink.attr("href"));
      });
    }
  }

  // ========================================================================= //
  //  //NAVBAR SHOW - HIDE
  // ========================================================================= //

  $(window).scroll(function () {
    var scroll = $(window).scrollTop();
    if (scroll > 200) {
      $("#main-nav, #main-nav-subpage").slideDown(700);
      $("#main-nav-subpage").removeClass("subpage-nav");
    } else {
      $("#main-nav").slideUp(700);
      $("#main-nav-subpage").hide();
      $("#main-nav-subpage").addClass("subpage-nav");
    }
  });

  // ========================================================================= //
  //  // RESPONSIVE MENU
  // ========================================================================= //

  $(".responsive").on("click", function (e) {
    $(".nav-menu").slideToggle();
  });

  // ========================================================================= //
  //  Typed Js
  // ========================================================================= //

  var typed = $(".typed");
  var typedBanner1 = $(".typed-banner-text-1");

  $(function () {
    typed.typed({
      strings: [
        " am Manoj Satish Kumar ",
        " have 8 years of experience in IT ",
        " am a frontend developer ",
        " work on Javascript ",
        " love to create websites ",
        " am a technology enthusiast ",
        " will help you crack interviews ",
        " will train you ",
        " will guide you in your career ",
        " would love to connect with you ",
      ],
      typeSpeed: 30,
      loop: true,
    });

    typedBanner1.typed({
      strings: [
        "to land on that dream job ",
        "to become a successful web developer ",
        "to master web technologies ",
        "to a much better future ",
        "to build the world wide web ",
      ],
      typeSpeed: 40,
      loop: true,
    });
  });

  $(function () {
    $("#desktop-nav-bar").load("/components/desktop-nav-bar.html");
    $("#footer").load("/components/footer.html");
  });
});

// window.addEventListener('load', () => {
//   registerSW();
// });

// async function registerSW() {
//   if ('serviceWorker' in navigator) {
//     try {
//       await navigator.serviceWorker.register('./sw.js');
//     } catch (e) {
//       console.log(`SW registration failed`);
//     }
//   }
// }
// let deferredPrompt;

// window.addEventListener('beforeinstallprompt', (e) => {
//   // alert("came")
//   try {
//     document.getElementsByClassName("pwa-install-section")[0].style.display = 'block';
//     document.getElementsByClassName("pwa-install-section")[1].style.display = 'block';

//   } catch (error) {

//   }
//   // Prevent the mini-infobar from appearing on mobile
//   // e.preventDefault();
//   // Stash the event so it can be triggered later.
//   deferredPrompt = e;
//   // Update UI notify the user they can install the PWA
//   // showInstallPromotion();
// });

// window.addEventListener('appinstalled', () => {
//   // Log install to analytics
//   console.log('INSTALL: Success');
//   try {
//     document.getElementsByClassName("pwa-install-section")[0].style.display = 'none';
//     document.getElementsByClassName("pwa-install-section")[1].style.display = 'none';

//   } catch (error) {

//   }
// });

// function buttonInstall() {
//   try {
//       // Hide the app provided install promotion
//   // Show the install prompt
//   deferredPrompt.prompt();

//   // Wait for the user to respond to the prompt
//   deferredPrompt.userChoice.then((choiceResult) => {
//     if (choiceResult.outcome === 'accepted') {
//       console.log('User accepted the install prompt');
//     } else {
//       console.log('User dismissed the install prompt');
//     }
//   });
//   } catch (error) {

//   }

// }
