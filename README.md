# Equilibrium-Based Baseline Selection for Excess Mortality

A method for selecting country-specific baseline periods when calculating excess mortality. Outperforms fixed baselines on 7/11 validation metrics.

## The Problem

Excess mortality estimates are highly sensitive to baseline selection, yet no gold standard exists. Different reference periods produce conflicting results.

## The Solution

Select baselines that minimize prediction error for post-pandemic equilibrium (2025):

$$B_i^* = \underset{B \in \mathcal{B}_i}{\arg\min} \text{RMSE}(B, 2025)$$

## Full Analysis

https://zgmurray.github.io/RethinkingExcessMortality/

## Data

Source: Human Mortality Database (STMF)  
Age-standardized using ESP2013
Quasi-Poisson Regression has been used for baselines
