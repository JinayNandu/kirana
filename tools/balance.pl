#!/usr/bin/perl
# Report the first line where ( [ { stop balancing, per file.
#
#   perl tools/balance.pl app/shop.js app/ui.js ...
#
# Strips strings, template literals, regex literals and comments first,
# because a brace inside a string is not a brace. This is the one check
# a browser cannot give a useful line number for: a module syntax error
# is reported at the point the parser gave up, not where the mistake is.
use strict;
use warnings;

for my $file (@ARGV) {
  open my $fh, '<:encoding(UTF-8)', $file or do { warn "$file: $!\n"; next };
  local $/;
  my $src = <$fh>;
  close $fh;

  my @ch = split //, $src;
  my ($line, @stack) = (1);
  my ($i, $n) = (0, scalar @ch);
  my $bad = 0;
  my $lastsig = '';     # last meaningful character, to tell / apart

  while ($i < $n) {
    my $c = $ch[$i];
    my $d = ($i + 1 < $n) ? $ch[$i + 1] : '';

    if ($c eq "\n") { $line++; $i++; next }

    # comments
    if ($c eq '/' && $d eq '/') { $i++ while $i < $n && $ch[$i] ne "\n"; next }
    if ($c eq '/' && $d eq '*') {
      $i += 2;
      while ($i < $n && !($ch[$i] eq '*' && ($i + 1 < $n) && $ch[$i + 1] eq '/')) {
        $line++ if $ch[$i] eq "\n";
        $i++;
      }
      $i += 2; next;
    }

    # A regex literal, NOT division. This is the whole reason the
    # sibling project needed a shared stripper: /[&<>"]/g otherwise
    # pairs its quote with the next string in the file and reports a
    # phantom imbalance a hundred lines away.
    #
    # / starts a regex when what came before it cannot end an
    # expression -- an operator, an opening bracket, a comma or
    # nothing at all.
    if ($c eq '/' && ($lastsig eq '' || $lastsig =~ m{^[(,=:\[!&|?{};+\-*%~^<>]$})) {
      $i++;
      my $incls = 0;
      while ($i < $n) {
        my $r = $ch[$i];
        if ($r eq "\\") { $i += 2; next }
        if ($r eq "\n") { last }            # unterminated; let the parser say so
        if ($r eq '[') { $incls = 1 }
        elsif ($r eq ']') { $incls = 0 }
        elsif ($r eq '/' && !$incls) { $i++; last }
        $i++;
      }
      $lastsig = '/';
      next;
    }

    # strings and template literals
    if ($c eq "'" || $c eq '"' || $c eq '`') {
      my $q = $c; my $start = $line; $i++;
      while ($i < $n) {
        if ($ch[$i] eq "\\") { $i += 2; next }
        if ($ch[$i] eq "\n") { $line++; last if $q ne '`' }
        if ($ch[$i] eq $q) { $i++; last }
        $i++;
      }
      if ($i >= $n) { print "$file: unterminated $q opened on line $start\n"; $bad = 1; last }
      $lastsig = 'x';       # a string ENDS an expression, so a / after it is division
      next;
    }

    if ($c eq '(' || $c eq '[' || $c eq '{') {
      push @stack, [$c, $line]; $lastsig = $c; $i++; next;
    }
    if ($c eq ')' || $c eq ']' || $c eq '}') {
      my $want = { ')' => '(', ']' => '[', '}' => '{' }->{$c};
      my $top = pop @stack;
      if (!$top) {
        print "$file:$line: stray $c with nothing open\n"; $bad = 1; last;
      }
      if ($top->[0] ne $want) {
        printf "%s:%d: found %s but %s from line %d is still open\n",
          $file, $line, $c, $top->[0], $top->[1];
        $bad = 1; last;
      }
      $lastsig = $c; $i++; next;
    }
    $lastsig = $c if $c =~ /\S/;
    $i++;
  }

  if (!$bad && @stack) {
    printf "%s: %s opened on line %d is never closed\n", $file, $stack[0][0], $stack[0][1];
    $bad = 1;
  }
  print "$file: balanced\n" unless $bad;
}
