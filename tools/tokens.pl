#!/usr/bin/perl
# CSS token parity, and the rule that keeps it honest.
#
#   perl tools/tokens.pl
#
# Two things, both of which have bitten the sibling project:
#
#  1. Both palettes must define the SAME set. A token defined in only
#     one of them is how a theme ends up black on black -- and it will
#     look perfect in whichever mode you happened to be testing.
#  2. No component rule may name a colour. That rule is only real if
#     something checks it, so this flags every literal colour outside
#     the two :root blocks.
use strict;
use warnings;

my $here = $0; $here =~ s{[^/]+$}{};
my $file = ($here || './') . '../app/index.html';
open my $fh, '<:encoding(UTF-8)', $file or die "$file: $!\n";
local $/;
my $src = <$fh>;
close $fh;

# Only the <style> block -- the markup below it is not our problem here.
my ($css) = $src =~ m{<style>(.*?)</style>}s;
die "no <style> block found\n" unless $css;

# Strip comments FIRST. The comment above the palettes says "never
# hardcode #fff", and without this the literal-colour scan reports the
# warning against hardcoding colours as a hardcoded colour. A checker
# that cries wolf is worse than no checker.
$css =~ s{/\*.*?\*/}{}gs;

# ONE :root block, the light palette. There were three -- light, dark
# by media query, and dark forced by a host setting data-theme -- and
# the two dark ones are in parked/dark-palette.css now. This file
# refuses to run if either comes back without its checks.
my %raw;
while ($css =~ /(:root[^{]*)\{([^}]*)\}/g) {
  my ($sel, $body) = ($1, $2);
  $sel =~ s/\s+//g;
  my $which = $sel eq ':root'                            ? 'light'
            : $sel eq ':root:not([data-theme="light"])'  ? 'dark'
            : $sel eq ':root[data-theme="dark"]'         ? 'darkforced'
            : undef;
  next unless $which;
  $raw{$which} = $body;
}
die "no :root block found for the light palette\n" unless defined $raw{light};

# Dark is PARKED -- parked/dark-palette.css. If a dark block has come
# back, the three checks that guarded a second palette have to come
# back with it, and they are not in this file any more. Shipping a
# second palette without them means holes nobody can see from the
# light one: a token defined in light and forgotten in dark renders
# as whatever it inherits, which is usually almost right.
for my $gone (qw(dark darkforced)) {
  next unless defined $raw{$gone};
  die "index.html has a '$gone' :root block, but dark mode is parked and\n"
    . "the checks that guard a second palette went with it.\n"
    . "See parked/dark-palette.css -- it says exactly what to restore here.\n";
}

my %def;
for my $which (keys %raw) {
  while ($raw{$which} =~ /(--[\w-]+)\s*:\s*([^;]+);/g) {
    my ($k, $v) = ($1, $2);
    $v =~ s/^\s+|\s+$//g;
    $def{$which}{$k} = $v;
  }
}

my $fails = 0;
sub bad { printf "  FAIL  %s\n", $_[0]; $fails++ }

# Spacing, radii, fonts and the header height are deliberately the same
# in both themes -- only a token carrying a COLOUR has to be redefined.
my $is_colour = sub { $_[0] =~ /#[0-9A-Fa-f]{3,8}\b|\brgba?\(|\bhsla?\(/ };

printf "  one palette, %d tokens\n", scalar keys %{ $def{light} };


# --- every var(--x) resolves ------------------------------------------
my %used;
$used{$1} = 1 while $css =~ /var\((--[\w-]+)/g;
for my $t (sort keys %used) {
  bad("var($t) is used but defined in neither palette")
    unless $def{light}{$t} || $def{dark}{$t};
}
printf "  %d distinct tokens referenced\n", scalar keys %used;

# A token nobody uses is dead weight, not a failure.
my @unused = grep { !$used{$_} } sort keys %{ $def{light} };
printf "  note  defined but never used: %s\n", join(' ', @unused) if @unused;

# --- no literal colours outside the palettes --------------------------
# Blank out the two :root blocks, then anything colour-shaped that is
# left is a component rule naming a colour.
my $rest = $css;
# Must match the SAME selectors as above -- `:root\s*\{` alone leaves
# :root:not(...) and :root[data-theme=...] in place, and then every
# token in the dark palettes is reported as a hardcoded colour.
$rest =~ s/:root[^{]*\{[^}]*\}//g;

my @lits;
while ($rest =~ /(#[0-9A-Fa-f]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\))/g) {
  my $lit = $1;
  # currentColor and transparent are not colours anyone has to theme.
  next if $lit =~ /^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/;
  push @lits, $lit;
}
if (@lits) {
  my %seen;
  for my $l (@lits) {
    next if $seen{$l}++;
    bad("literal colour '$l' outside the palettes -- give it a token");
  }
} else {
  print "  ok    no component rule names a colour\n";
}

print $fails ? "\n$fails FAILED\n" : "\nthe palette holds together\n";
exit($fails ? 1 : 0);
